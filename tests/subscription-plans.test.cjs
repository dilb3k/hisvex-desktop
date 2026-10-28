const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./helpers/load-source.cjs');
const {subscriptionPlans,subscriptionBotUrl}=loadSource('src/utils/subscriptionPlans.ts');
const pricingSource='../comp-bar-server/backend/src/modules/payments/payment.constants.ts';
const {PRICING}=require('node:fs').existsSync(pricingSource) ? loadSource(pricingSource) : {PRICING:{bor:{1:44000,6:237600,12:422400},pro:{1:99000,6:534600,12:950400}}};
test('all displayed paid durations match checkout prices and purchase opens the bot subscription route',()=>{
 assert.equal(subscriptionBotUrl,'https://t.me/hisvex_bot?start=obuna');
 assert.equal(subscriptionPlans.length,3);
 for(const tier of ['bor','pro']) {
 const plan=subscriptionPlans.find(p=>p.key===tier);
 [1,6,12].forEach((months,i)=>assert.equal(plan.prices[i],PRICING[tier][months]));
 }
});
