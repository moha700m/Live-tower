import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTikTokEvent, normalizeTikTokUniqueId} from './provider.ts';
test('TikTok handles are normalized before connecting',()=>{
 assert.equal(normalizeTikTokUniqueId('  @Mohammed  '),'Mohammed');
});
test('TikTok common message IDs remain stable across replay',()=>{
 const data={common:{msgId:'12345678901234567890'},user:{userId:'998',uniqueId:'Mohammed',nickname:'محمد'}};
 const first=normalizeTikTokEvent('rise966','FOLLOW',data), replay=normalizeTikTokEvent('rise966','FOLLOW',data);
 assert.equal(first.eventId,replay.eventId);assert.equal(first.viewer.providerUserId,'998');assert.equal(first.viewer.nickname,'محمد');
 assert.notEqual(first.eventId,normalizeTikTokEvent('other','FOLLOW',data).eventId);
 assert.notEqual(first.eventId,normalizeTikTokEvent('rise966','SHARE',data).eventId);
});

test('real connector gift shape ignores intermediate cumulative streak packets', async()=>{
 const {normalizeTikTokGift}=await import('./provider.ts');
 const data={common:{msgId:'gift-final'},user:{userId:'998',nickname:'محمد'},giftId:'5655',gift:{type:1,name:'Rose'},repeatCount:12,repeatEnd:0};
 assert.equal(normalizeTikTokGift('rise966',data),undefined);
 const final=normalizeTikTokGift('rise966',{...data,repeatEnd:1});
 assert.equal(final?.payload?.giftName,'Rose');assert.equal(final?.payload?.repeatCount,12);
 assert.equal(final?.eventId,normalizeTikTokGift('rise966',{...data,repeatEnd:1})?.eventId);
});
