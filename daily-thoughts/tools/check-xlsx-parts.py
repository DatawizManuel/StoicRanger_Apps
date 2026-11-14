"""Compares an xlsx before and after Daily Thoughts wrote it (used by tools/test-sync.js and tools/test-nextcloud.sh).
   python3 tools/check-xlsx-parts.py <before.xlsx> <after.xlsx>
   Every part of the original zip except workbook.xml, its rels and [Content_Types].xml must be byte-identical (other
   apps' sheets, styles, drop-down lists); openpyxl must open the result with the same cell values and data validations
   on every other sheet, and DT_Favourites / _DT_Data (hidden) must be there. Prints PASS/FAIL lines, exit 1 on a FAIL."""
import sys, zipfile, openpyxl

before, after = sys.argv[1], sys.argv[2]
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails += 1

za, zb = zipfile.ZipFile(before), zipfile.ZipFile(after)
ok(zb.testzip() is None, 'the new file is a sound zip (CRC of every part)')
meta = {'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'}
changed = [n for n in za.namelist() if n not in meta and (n not in zb.namelist() or za.read(n) != zb.read(n))]
ok(not changed, 'every other part byte-identical (%d parts)%s' % (len(za.namelist()) - len(meta), (': changed ' + ', '.join(changed)) if changed else ''))

wa, wb = openpyxl.load_workbook(before), openpyxl.load_workbook(after)
mine = {'DT_Favourites', '_DT_Data'}
others = [n for n in wa.sheetnames if n not in mine]
ok([n for n in wb.sheetnames if n not in mine] == others, 'other sheets in the same order: ' + ', '.join(others))
diff = []
for n in others:
    a, b = wa[n], wb[n]
    if a.sheet_state != b.sheet_state: diff.append(n + ' visibility')
    va = [[c.value for c in r] for r in a.iter_rows()]
    vb = [[c.value for c in r] for r in b.iter_rows()]
    if va != vb: diff.append(n + ' values')
    if len(a.data_validations.dataValidation) != len(b.data_validations.dataValidation): diff.append(n + ' drop-down lists')
ok(not diff, 'other sheets: same values, visibility and drop-down lists' + (' (differs: ' + ', '.join(diff) + ')' if diff else ''))
ok('DT_Favourites' in wb.sheetnames and wb['DT_Favourites'].sheet_state == 'visible', 'DT_Favourites there and visible')
ok('_DT_Data' in wb.sheetnames and wb['_DT_Data'].sheet_state == 'hidden', '_DT_Data there and hidden')
if 'DT_Favourites' in wb.sheetnames:
    rows = list(wb['DT_Favourites'].iter_rows(values_only=True))
    ok(rows and list(rows[0][:5]) == ['Quote ID', 'Author', 'Quote', 'Saved at', 'Note'], 'DT_Favourites header row')
    ids = [r[0] for r in rows[1:] if r and r[0]]
    ok(len(ids) == len(set(ids)), 'no favourite twice (%d rows)' % len(ids))
    print('INFO favourites in file: %d' % len(ids))
sys.exit(1 if fails else 0)
