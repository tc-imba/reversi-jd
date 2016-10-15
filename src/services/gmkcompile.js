import { argv } from 'yargs';
import _ from 'lodash';
import format from 'string-format';
import path from 'path';
import fsp from 'fs-promise';
import lzma from 'lzma-native';
import { exec } from 'child-process-promise';
import api from 'libs/api';

const LZMA_COMPRESS_OPTIONS = {
  preset: 4,
  threads: 0,
};

export default async (mq, logger) => {

  if (argv.role !== 'compile') {
    return;
  }

  const LIMITS = await api.getLimits();
  const { LIMIT_SIZE_TEXT, LIMIT_SIZE_EXECUTABLE } = LIMITS;

  logger.info('Received limits from API server', LIMITS);

  async function handleCompileTask(task) {
    const submission = await api.compileBegin(task);

    try {
      const workingDirectory = path.resolve(format(DI.config.compile.workingDirectory, submission));
      const source = format(DI.config.compile.source, submission);
      const target = format(DI.config.compile.target, submission);
      const sandbox = DI.config.sandbox === null ? null : path.resolve(DI.config.sandbox);
      const sandboxArgs = DI.config.sandbox === null ? null : DI.config.compile.sandbox;
      const compileCmd = format(DI.config.compile.command, { ...submission, source, target });

      await fsp.ensureDir(workingDirectory);
      await fsp.writeFile(path.join(workingDirectory, source), submission.code);

      let success, stdout, stderr;

      try {
        const execResult = await exec(_.filter([sandbox, sandboxArgs, compileCmd]).join(' '), {
          cwd: workingDirectory,
          timeout: DI.config.compile.timeout,
          maxBuffer: 1 * 1024 * 1024,
        });
        stdout = execResult.stdout;
        stderr = execResult.stderr;
        success = true;
      } catch (err) {
        stdout = err.stdout;
        stderr = err.stderr;
        success = false;
      }
      let text = (stdout + '\n' + stderr).trim();
      if (text.length > LIMIT_SIZE_TEXT) {
        text = text.substr(0, LIMIT_SIZE_TEXT) + '...';
      }
      let binaryBuffer = null;
      if (success) {
        const fp = path.join(workingDirectory, target);
        const stat = await fsp.stat(fp);
        if (stat.size > LIMIT_SIZE_EXECUTABLE) {
          text = 'Compile succeeded but binary limit exceeded';
          success = false;
        } else {
          binaryBuffer = await lzma.compress(await fsp.readFile(fp), LZMA_COMPRESS_OPTIONS);
        }
      }
      await api.compileEnd(task, text, success, binaryBuffer);
    } catch (err) {
      await api.compileError(task, `System internal error occured when compiling this submission.\n\n${err.stack}`);
      throw err;
    }
  }

  mq.subscribe('compile', (err, subscription) => {
    if (err) throw err;
    subscription.on('error', err => logger.error(err));
    subscription.on('message', async (message, task, ackOrNack) => {
      logger.info('Compile', task);
      try {
        await handleCompileTask(task);
      } catch (e) {
        logger.error(e);
      }
      ackOrNack();
    });
  });

  logger.info('Accepting compiler tasks...');

};
