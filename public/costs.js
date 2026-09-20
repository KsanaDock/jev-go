export function costEntry(data, model, ok) {
  const value=data?.billing?.cost??data?.usage?.cost;
  const cost=typeof value==='number' && Number.isFinite(value) && value>=0 ? value:null;
  return {model,ok,cost,chargeUnknown:cost===null && data?.billing?.chargePossible!==false};
}
export function summarizeCosts(entries) {
  return {currency:'USD',knownTotal:entries.reduce((sum,e)=>sum+(e.cost??0),0),requests:entries.length,unknownRequests:entries.filter(e=>e.chargeUnknown).length};
}
