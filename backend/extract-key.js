const fs = require('fs');
const forge = require('node-forge');

const pfx = fs.readFileSync('File.pfx');
const password = 'password'; // Replace with the password you set

const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag];
if (!keyBags || keyBags.length === 0) {
  keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
}
if (!keyBags || keyBags.length === 0) {
  throw new Error('No private key found in PFX');
}

const bag = keyBags[0];
const privateKeyPem = forge.pki.privateKeyToPem(bag.key);
fs.writeFileSync('server.key', privateKeyPem);
console.log('server.key created!');