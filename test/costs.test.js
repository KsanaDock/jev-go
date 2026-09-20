import {test} from 'node:test';
import assert from 'node:assert/strict';
import {costEntry,summarizeCosts} from '../public/costs.js';
test('cost ledger combines models and retries independently of retained moves',()=>{
  const charges=[costEntry({usage:{cost:.00012}},'jev',true),costEntry({billing:{cost:.00034,chargePossible:true}},'deepseek',false),costEntry({usage:{cost:.00056}},'deepseek',true)];
  const s=summarizeCosts(charges);assert.ok(Math.abs(s.knownTotal-.00102)<1e-12);assert.equal(s.requests,3);assert.equal(s.unknownRequests,0);
  assert.deepEqual(summarizeCosts([]),{currency:'USD',knownTotal:0,requests:0,unknownRequests:0});
});
test('unknown charges are separate from explicit zero and locally rejected requests',()=>{
  const s=summarizeCosts([costEntry({usage:{cost:0}},'jev',true),costEntry({usage:{}},'jev',true),costEntry(null,'deepseek',false),costEntry({billing:{cost:null,chargePossible:false}},'deepseek',false)]);
  assert.equal(s.knownTotal,0);assert.equal(s.unknownRequests,2);assert.equal(s.requests,4);
  for(const cost of [-1,NaN,Infinity,'0.1'])assert.equal(costEntry({usage:{cost}},'jev',true).cost,null);
});
