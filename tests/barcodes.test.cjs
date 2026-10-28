const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadSource}=require('./helpers/load-source.cjs');
const base=fs.existsSync('src/lib/barcodes.ts')?'src/lib':'src/utils';
const {findProductByBarcode:find}=loadSource(`${base}/barcodes.ts`);
test('retail barcode matches UPC-A, EAN-13 and padded GTIN without changing stored code',()=>{
 const product={barcodes:['036000291452']};
 for(const scan of ['036000291452','0036000291452','00036000291452',' 0036000291452\r\n']) assert.equal(find([product],scan),product);
 assert.equal(product.barcodes[0],'036000291452');
});
test('custom codes remain exact, blank/deleted/ambiguous codes never select a wrong product',()=>{
 const custom={barcodes:['00123','AbC-123','  item  ']};
 assert.equal(find([custom],'item'),custom);assert.equal(find([custom],'123'),undefined);assert.equal(find([custom],'abc-123'),undefined);
 assert.equal(find([custom],''),undefined);assert.equal(find([{...custom,deleted:true}],'00123'),undefined);
 assert.equal(find([{barcodes:['036000291452']},{barcodes:['0036000291452']}],'00036000291452'),undefined);
 const exact={barcodes:['00036000291452']};assert.equal(find([exact,{barcodes:['036000291452']}],'00036000291452'),exact);
 assert.equal(find([{barcodes:['123456789013']}],'0123456789013'),undefined,'invalid checksum does not gain aliases');
});
