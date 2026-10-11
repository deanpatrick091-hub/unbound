import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoFailure,videoQuotaBlocked,VIDEO_QUOTA_MESSAGE} from '../lib/videos/errors.ts';
test('video HTTP failures are distinguished without leaking provider content',()=>{
 for(const [status,code] of [[402,'quota'],[429,'rate_limit'],[401,'credentials'],[403,'permission'],[404,'model'],[422,'request'],[503,'outage']]){
 const result=videoFailure({httpResponse:{status,body:'private prompt or token'},message:'private prompt or token'});
 assert.equal(result.code,code);assert.ok(!JSON.stringify(result).includes('private prompt'));
 }
 assert.equal(videoFailure({name:'TimeoutError'}).code,'timeout');assert.equal(videoFailure({videoCode:'storage'}).code,'storage');
});
test('credit guard requires a real past reset after the failure and does not block ordinary 429',()=>{
 const job={error:VIDEO_QUOTA_MESSAGE,created_at:'2026-01-01T00:00:00Z'};
 for(const value of [undefined,'garbage','2025-12-01T00:00:00Z','2999-01-01T00:00:00Z'])assert.equal(videoQuotaBlocked(job,value),true);
 assert.equal(videoQuotaBlocked(job,'2026-02-01T00:00:00Z'),false);
 assert.equal(videoQuotaBlocked({...job,error:videoFailure({httpResponse:{status:429}}).message},undefined),false);
});
