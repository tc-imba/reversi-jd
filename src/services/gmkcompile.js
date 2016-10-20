import { argv } from 'yargs';
import { execFile } from 'child-process-promise';
import path from 'path';
import del from 'del';
import fsp from 'fs-promise';
import lzma from 'lzma-native';
import api from 'libs/api';
import utils from 'libs/utils';

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
      const formatArgv = { runtimeDir, compileConfig, submission };

      // ensure order
      for (const key of ['source', 'target', 'clean', 'command', 'args']) {
        compileConfig[key] = utils.formatDeep(compileConfig[key], formatArgv);
      }

      await fsp.ensureDir(path.dirname(compileConfig.source));
      await fsp.ensureDir(path.dirname(compileConfig.target));
      await fsp.writeFile(compileConfig.source, submission.code);

      let execOptFile, execOptArgs;
      if (enableSandbox) {
        execOptFile = path.resolve(DI.config.sandbox);
        execOptArgs = [
          ...utils.parseArgs(compileConfig.sandboxArgs),
          compileConfig.command,
          ...utils.parseArgs(compileConfig.args),
        ];
      } else {
        execOptFile = compileConfig.command;
        execOptArgs = utils.parseArgs(compileConfig.args);
      }

      let success, stdout, stderr;

      try {
        const execResult = await execFile(execOptFile, execOptArgs, {
          cwd: runtimeDir,
          timeout: compileConfig.timeout,
          maxBuffer: 1 * 1024 * 1024,
        });
        stdout = execResult.stdout;
        stderr = execResult.stderr;
        success = true;
      } catch (err) {
        stdout = err.stdout;
        stderr = err.message;
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

      logger.info('Compile %s end (success = %s)', task.sdocid, success);
      await api.compileEnd(task.sdocid, task.token, text, success, binaryBuffer);

      try {
        await del(compileConfig.clean, { force: true });
      } catch (e) {
        logger.error(e);
      }

    } catch (err) {
      await api.compileError(task.sdocid, task.token, `System internal error occured when compiling this submission.\n\n${err.stack}`);
      throw err;
    }
  }

  mq.subscribe('compile', (err, subscription) => {
    if (err) throw err;
    subscription.on('error', err => logger.error(err));
    subscription.on('message', async (message, task, ackOrNack) => {
      logger.info('Compile %s: %s', task.sdocid, JSON.stringify(task));
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
