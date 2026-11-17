"""Compares an xlsx before and after SR Physical Fitness wrote it (used by tools/test-nextcloud.sh).
   python3 tools/check-xlsx-parts.py <before.xlsx> <after.xlsx>
   Every part of the original zip except workbook.xml, its rels, [Content_Types].xml and the parts of our own sheets
   (PF_..., _PF_Data, the shared _Deleted) must be byte-identical (other apps' sheets, styles, drop-down lists); openpyxl
   must open the result with the same cell values and data validations on every other sheet. Prints PASS/FAIL lines."""
import sys, re, zipfile, openpyxl

before, after = sys.argv[1], sys.argv[2]
fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails += 1
mine_name = lambda n: n.startswith('PF_') or n in ('_PF_Data', '_Deleted')

za, zb = zipfile.ZipFile(before), zipfile.ZipFile(after)
ok(zb.testzip() is None, 'the new file is a sound zip (CRC of every part)')
def own_parts(z):
    wb = z.read('xl/workbook.xml').decode(); rels = z.read('xl/_rels/workbook.xml.rels').decode()
    tg = {m.group(1): m.group(2) for m in re.finditer(r'<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"', rels)}
    tg.update({m.group(2): m.group(1) for m in re.finditer(r'<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"', rels)})
    out = set()
    for m in re.finditer(r'<sheet\b[^>]*>', wb):
        t = m.group(0); n = re.search(r'name="([^"]*)"', t).group(1); rid = re.search(r':id="([^"]*)"', t).group(1)
        if mine_name(n) and rid in tg: p = tg[rid].lstrip('/'); out.add(p if p.startswith('xl/') else 'xl/' + p)
    return out
meta = {'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'} | own_parts(za)
changed = [n for n in za.namelist() if n not in meta and (n not in zb.namelist() or za.read(n) != zb.read(n))]
ok(not changed, 'every other part byte-identical (%d parts)%s' % (len([n for n in za.namelist() if n not in meta]), (': changed ' + ', '.join(changed)) if changed else ''))

wa, wb = openpyxl.load_workbook(before), openpyxl.load_workbook(after)
others = [n for n in wa.sheetnames if not mine_name(n)]
ok([n for n in wb.sheetnames if not mine_name(n)] == others, 'other sheets in the same order: ' + ', '.join(others))
diff = []
for n in others:
    a, b = wa[n], wb[n]
    if a.sheet_state != b.sheet_state: diff.append(n + ' visibility')
    if [[c.value for c in r] for r in a.iter_rows()] != [[c.value for c in r] for r in b.iter_rows()]: diff.append(n + ' values')
    if len(a.data_validations.dataValidation) != len(b.data_validations.dataValidation): diff.append(n + ' drop-down lists')
ok(not diff, 'other sheets: same values, visibility and drop-down lists' + (' (differs: ' + ', '.join(diff) + ')' if diff else ''))
for n in ('PF_Weight', 'PF_Drinks', 'PF_Sets', 'PF_Settings'):
    ok(n in wb.sheetnames and wb[n].sheet_state == 'visible', n + ' there and visible')
ok('_PF_Data' in wb.sheetnames and wb['_PF_Data'].sheet_state == 'hidden', '_PF_Data there and hidden')
ok('_Deleted' in wb.sheetnames and wb['_Deleted'].sheet_state == 'hidden', '_Deleted there and hidden')
if '_Deleted' in wa.sheetnames:
    old = {tuple(r[:3]) for r in wa['_Deleted'].iter_rows(min_row=2, values_only=True) if r and r[0] and r[0] != 'PF'}
    new = {tuple(r[:3]) for r in wb['_Deleted'].iter_rows(min_row=2, values_only=True) if r and r[0]}
    ok(old <= new, 'other apps\' rows in _Deleted kept (%d)' % len(old))
for n in ('PF_Weight', 'PF_Drinks'):
    if n in wb.sheetnames:
        rows = list(wb[n].iter_rows(min_row=2, values_only=True)); ids = [r[0] for r in rows if r and r[0]]
        ok(len(ids) == len(set(ids)), '%s: no row twice' % n)
        print('INFO %s rows in file: %d' % (n, len(ids)))
sys.exit(1 if fails else 0)
