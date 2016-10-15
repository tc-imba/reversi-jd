import { argv } from 'yargs';

export default async (mq, logger) => {

  if (argv.role !== 'match') {
    return;
  }

  const subscription = await mq.subscribe('judge');
  subscription.on('message', (message, content, ackOrNack) => {

  });

  logger.info('Accepting match tasks...');

};
