/* Sets the icon and the version of StoicRanger.exe. Usage: node tools/res.js <exe> <icon.ico> <version> */
const ResEdit = require('resedit'), fs = require('fs');
const [exe, icon, ver] = process.argv.slice(2);
const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true }), res = ResEdit.NtExecutableResource.from(pe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icon));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0], v = [...ver.split('.').map(Number), 0];
vi.setFileVersion(...v, 1033); vi.setProductVersion(...v, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'Stoic Ranger', ProductName: 'Stoic Ranger', CompanyName: 'Stoic Ranger', LegalCopyright: 'Manuel Faessler',
  OriginalFilename: 'StoicRanger.exe', InternalName: 'StoicRanger', FileVersion: ver, ProductVersion: ver });
vi.outputToResourceEntries(res.entries);
res.outputResource(pe); fs.writeFileSync(exe, Buffer.from(pe.generate()));
console.log('icon and version set', ver);
