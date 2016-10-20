import { argv } from 'yargs';
import { exec } from 'child-process-promise';
import path from 'path';
import del from 'del';
import fsp from 'fs-promise';
import lzma from 'lzma-native';
import api from 'libs/api';
import utils from 'libs/utils';

const LZMA_DECOMPRESS_OPTIONS = {
  threads: 1,
};

const EXITCODE_MIN = 33;
const EXITCODE_MAX = EXITCODE_MIN + 3;

export default async (mq, logger) => {

  if (argv.role !== 'match') {
    return;
  }

  const runtimeDir = path.resolve(DI.config.runtimeDirectory);
  await fsp.ensureDir(runtimeDir);

  async function handleJudgeTask(task) {
    try {
      await api.roundBegin(task.mdocid, task.rid);

      const matchConfig = { ...DI.config.match };
      const formatArgv = { runtimeDir, matchConfig, task };
      
      // ensure order
      for (const key of ['s1bin', 's2bin', 'map', 'config', 'summary', 'clean', 'command']) {
        matchConfig[key] = utils.formatDeep(matchConfig[key], formatArgv);
      }

      await fsp.ensureDir(path.dirname(matchConfig.s1bin));
      await fsp.writeFile(
        matchConfig.s1bin,
        await lzma.decompress(await api.getSubmissionBinary(task.s1docid), LZMA_DECOMPRESS_OPTIONS),
        { mode: 0o755 }
      );

      await fsp.ensureDir(path.dirname(matchConfig.s2bin));
      await fsp.writeFile(
        matchConfig.s2bin,
        await lzma.decompress(await api.getSubmissionBinary(task.s2docid), LZMA_DECOMPRESS_OPTIONS),
        { mode: 0o755 }
      );

      await fsp.ensureDir(path.dirname(matchConfig.map));
      await fsp.writeFile(matchConfig.map, task.map);

      await fsp.ensureDir(path.dirname(matchConfig.config));
      await fsp.writeFile(matchConfig.config, JSON.stringify({
        'sandbox': DI.config.sandbox === null ? null : path.resolve(DI.config.sandbox),
        'summary': matchConfig.summary,
        'board': matchConfig.map,
        'brain0.field': task.u1field,
        'brain0.bin': matchConfig.s1bin,
        'brain0.moveTimeout': task.rules.moveTimeout,
        'brain0.roundTimeout': task.rules.roundTimeout,
        'brain0.memoryLimit': task.rules.memoryLimit,
        'brain1.bin': matchConfig.s2bin,
        'brain1.moveTimeout': task.rules.moveTimeout,
        'brain1.roundTimeout': task.rules.roundTimeout,
        'brain1.memoryLimit': task.rules.memoryLimit,
        'width': task.rules.width,
        'height': task.rules.height,
        'winningStones': task.rules.winningStones,
      }, null, 2));

      let stdout, stderr, code = 0;
      try {
        const execResult = await exec(matchConfig.command, {
          cwd: runtimeDir,
          maxBuffer: 10 * 1024 * 1024,
        });
        stdout = execResult.stdout;
        stderr = execResult.stderr;
      } catch (err) {
        stdout = err.stdout;
        stderr = err.stderr;
        code = err.code;
      }

      if (code < EXITCODE_MIN || code > EXITCODE_MAX) {
        throw new Error(`Unexpected judge exit code ${code}. ${stderr}`);
      }

      logger.info('Match %s (round %s) complete', task.mdocid, task.rid);
      await api.roundComplete(task.mdocid, task.rid, code, stdout);

      try {
        await del(matchConfig.clean, { force: true });
      } catch (e) {
        logger.error(e);
      }

    } catch (err) {
      await api.roundError(task.mdocid, task.rid, `System internal error occured when judging this round.\n\n${err.stack}`);
      throw err;
    }
  }

  mq.subscribe('judge', (err, subscription) => {
    if (err) throw err;
    subscription.on('error', err => logger.error(err));
    subscription.on('message', async (message, task, ackOrNack) => {
      logger.info('Match %s (round %s): %s', task.mdocid, task.rid, JSON.stringify(task));
      try {
        await handleJudgeTask(task);
      } catch (e) {
        logger.error(e);
      }
      ackOrNack();
    });
  });

  logger.info('Accepting match tasks...');

};
