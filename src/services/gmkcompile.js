import { argv } from 'yargs';
import { exec } from 'child-process-promise';
import format from 'string-format';
import path from 'path';
import fsp from 'fs-promise';
import lzma from 'lzma-native';
import api from 'libs/api';

const LZMA_COMPRESS_OPTIONS = {
  preset: 4,
  threads: 0,
};

export default async (mq, logger) => {

  if (argv.role !== 'compile') {
    return;
  }

  const runtimeDir = path.resolve(DI.config.runtimeDirectory);
  await fsp.ensureDir(runtimeDir);

  const enableSandbox = DI.config.sandbox !== null;

  async function handleCompileTask(task) {
    try {
      const submission = await api.compileBegin(task.sdocid, task.token);
      const compileConfig = { ...DI.config.compile };
      const formatArgv = { compileConfig, submission };
      compileConfig.source = path.join(runtimeDir, format(compileConfig.source, formatArgv));
      compileConfig.target = path.join(runtimeDir, format(compileConfig.target, formatArgv));
      compileConfig.command = format(compileConfig.command, formatArgv);

      await fsp.ensureDir(path.dirname(compileConfig.source));
      await fsp.ensureDir(path.dirname(compileConfig.target));
      await fsp.writeFile(compileConfig.source, submission.code);

      const execCommands = [];
      if (enableSandbox) {
        execCommands.push(DI.config.sandbox);
        execCommands.push(compileConfig.sandboxArgv);
      }
      execCommands.push(compileConfig.command);

      let success, stdout, stderr;

      try {
        const execResult = await exec(execCommands.join(' '), {
          cwd: runtimeDir,
          timeout: compileConfig.timeout,
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
      if (text.length > task.limits.sizeOfText) {
        text = text.substr(0, task.limits.sizeOfText) + '...';
      }

      let binaryBuffer = null;
      if (success) {
        const stat = await fsp.stat(compileConfig.target);
        if (stat.size > task.limits.sizeOfBin) {
          text = 'Compile succeeded but binary limit exceeded';
          success = false;
        } else {
          binaryBuffer = await lzma.compress(await fsp.readFile(compileConfig.target), LZMA_COMPRESS_OPTIONS);
        }
      }
      await api.compileEnd(task.sdocid, task.token, text, success, binaryBuffer);
    } catch (err) {
      await api.compileError(task.sdocid, task.token, `System internal error occured when compiling this submission.\n\n${err.stack}`);
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
