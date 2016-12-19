import { argv } from 'yargs';
import path from 'path';
import del from 'del';
import fsp from 'fs-promise';
import uuid from 'uuid';
import lzma from 'lzma-native';

import api from 'libs/api';
import compile from 'libs/compile';

const LZMA_COMPRESS_OPTIONS = {
  preset: 4,
  threads: 0,
};

export default async (mq, logger) => {

  if (argv.role !== 'compile') {
    return;
  }

  logger.debug('Compiler settings: %s', JSON.stringify(compile.settings, null, 2));

  async function handleCompileTask(task) {
    const workingDirectory = path.resolve(DI.config.runtimeDirectory, `compile/${uuid.v4()}`);
    await fsp.ensureDir(workingDirectory);

    try {
      let submission;
      try {
        submission = await api.compileBegin(task.sdocid, task.token);
      } catch (err) {
        if (err instanceof api.APIUserError) {
          logger.info('Ignored task %s: %s', task.sdocid, err.message);
          return;
        }
        throw err;
      }

      const { text, success, binaryBuffer } = await compile.doCompile({
        workingDirectory,
        code: submission.code,
        compiler: submission.compiler,
        limits: task.limits,
      });

      logger.info('Compile %s end (success = %s)', task.sdocid, success);

      let lzmaBuffer = await lzma.compress(binaryBuffer, LZMA_COMPRESS_OPTIONS);
      await api.compileEnd(task.sdocid, task.token, text, success, lzmaBuffer);
    } catch (err) {
      await api.compileError(task.sdocid, task.token, `System internal error occured when compiling this submission.\n\n${err.stack}`);
      throw err;
    } finally {
      try {
        await del(workingDirectory, { force: true });
      } catch (e) {
        logger.error(e);
      }
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
