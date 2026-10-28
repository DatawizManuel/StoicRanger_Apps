#!/usr/bin/env python3
"""zipalign -p 4 equivalent: stored entries start on 4-byte boundaries (.so on 4096). Usage: zipalign.py in.apk out.apk"""
import sys, zipfile, struct

def main(src, dst):
    zin = zipfile.ZipFile(src)
    with open(dst, "wb") as out:
        central = []
        for info in zin.infolist():
            data = zin.open(info).read()
            comp = info.compress_type
            if comp == zipfile.ZIP_DEFLATED:
                import zlib
                c = zlib.compressobj(9, zlib.DEFLATED, -15)
                payload = c.compress(data) + c.flush()
            else:
                payload = data
            name = info.filename.encode("utf-8")
            offset = out.tell()
            hdr_len = 30 + len(name)
            extra = b""
            if comp == zipfile.ZIP_STORED:
                align = 4096 if info.filename.endswith(".so") else 4
                pad = (-(offset + hdr_len)) % align
                extra = b"\0" * pad
            crc = zipfile.crc32(data) & 0xffffffff
            dt = (0, 33)  # fixed DOS time/date for reproducibility
            out.write(struct.pack("<IHHHHHIIIHH", 0x04034b50, 20, 0x0800, comp, dt[0], dt[1], crc, len(payload), len(data), len(name), len(extra)))
            out.write(name); out.write(extra); out.write(payload)
            central.append((name, comp, crc, len(payload), len(data), offset))
        cd_start = out.tell()
        for name, comp, crc, csize, usize, offset in central:
            out.write(struct.pack("<IHHHHHHIIIHHHHHII", 0x02014b50, 20, 20, 0x0800, comp, 0, 33, crc, csize, usize, len(name), 0, 0, 0, 0, 0, offset))
            out.write(name)
        cd_end = out.tell()
        out.write(struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, len(central), len(central), cd_end - cd_start, cd_start, 0))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
