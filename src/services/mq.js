import bluebird from 'bluebird';
import Rascal from 'rascal';

bluebird.promisifyAll(Rascal.Broker);
bluebird.promisifyAll(Rascal.Broker.prototype);

export default async (logger) => {

  const broker = await Rascal.Broker.createAsync(Rascal.withDefaultConfig(DI.config.mq));
  broker.on('error', e => logger.error(e));

  // promisified subscribe may lose message :(
  // async subscribe(subscribeId) {
  //   const subscription = await broker.subscribeAsync(subscribeId);
  //   subscription.on('error', e => logger.error(e));
  //   return subscription;
  // },

  return broker;

};
