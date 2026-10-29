// One Redis read transaction: moving jobs cannot disappear between LLEN/ZCARDs.
export async function readQueueBacklog(redis) {
  const queues=['cove-grading','cove-staff-practice','cove-sample-checks','cove-regrade'];
  const transaction=redis.multi();
  for(const queue of queues) {
    for(const state of ['wait','active','paused'])transaction.llen(`bull:${queue}:${state}`);
    for(const state of ['delayed','prioritized','waiting-children'])transaction.zcard(`bull:${queue}:${state}`);
  }
  const results=await transaction.exec();
  if(!results||results.length!==24||results.some(([error,count])=>error||!Number.isSafeInteger(count)||count<0))throw new Error('Incomplete queue inventory');
  return Object.fromEntries(queues.map((queue,index)=>[queue,results.slice(index*6,index*6+6).reduce((sum,[,count])=>sum+count,0)]));
}
