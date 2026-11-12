"""Create the small shipped sound set from the user's existing CC0 source pack."""
import array, hashlib, json, os, pathlib, subprocess, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "audio"
OUTPUT.mkdir(parents=True, exist_ok=True)
source = ROOT / "audio" / "Technology" / "mouse-clicks-scrolls.wav"
raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(source), "-ac", "1", "-ar", "22050", "-f", "s16le", "-"])
samples = array.array("h", raw)
windows = [max(abs(x) for x in samples[n:n+220]) / 32768 for n in range(0,len(samples)-220,220)]
peaks = []
for n in range(2, len(windows)-2):
    if windows[n] > 0.12 and windows[n] == max(windows[n-2:n+3]) and (not peaks or n-peaks[-1] > 18):
        peaks.append(n)
if len(peaks) < 3:
    raise RuntimeError("Insufficient mechanical transients in source")
rows = []
def make(name, relative, start, duration, lowpass=5000):
    source_file = ROOT / "audio" / relative
    fades = max(0.01,duration-0.016)
    filters = f"highpass=f=90,lowpass=f={lowpass},afade=t=in:d=0.004,afade=t=out:st={fades}:d=0.016,alimiter=limit=0.8:level=false"
    subprocess.run(["ffmpeg","-v","error","-y","-ss",str(start),"-i",str(source_file),"-t",str(duration),"-ac","1","-ar","44100","-af",filters,"-c:a","libvorbis","-q:a","4",str(OUTPUT/(name+".ogg"))],check=True)
    rows.append((name+".ogg",relative,f"Excerpt {start:.3f}s / {duration:.3f}s; mono 44.1 kHz OGG; high-pass 90 Hz, low-pass {lowpass} Hz, edge fades; peaks limited without automatic gain"))
for index, peak in enumerate(peaks[:3]):
    make(f"key-0{index+1}", "Technology/mouse-clicks-scrolls.wav", max(0,peak*220/22050-0.01),0.085)
make("drive-seek-short","Technology/mouse-clicks-scrolls.wav",max(0,peaks[min(4,len(peaks)-1)]*220/22050-0.01),0.22,2100)
make("drive-seek-long","Misc Foley/computer-pack-away.wav",1.70,0.48,1700)
make("relay","Technology/plugpull.wav",0,0.30,2800)
archive = ROOT / "audio" / "Owlish Media Sound Effects.zip"
verification = []
with zipfile.ZipFile(archive) as pack:
    for relative in sorted(set(row[1] for row in rows)):
        candidates=[n for n in pack.namelist() if n.replace("\\","/").endswith(relative)]
        if len(candidates)!=1: raise RuntimeError("Cannot identify source in archive: "+relative)
        digest=hashlib.sha256((ROOT/"audio"/relative).read_bytes()).hexdigest()
        if digest != hashlib.sha256(pack.read(candidates[0])).hexdigest(): raise RuntimeError("Source differs from archive: "+relative)
        verification.append({"source":relative,"sha256":digest,"archiveEntry":candidates[0]})
header = """# Bundled audio
Source: [Owlish Media Sound Effects Pack](https://opengameart.org/content/sound-effects-pack), by OwlishMedia, CC0.
Archive: Owlish Media Sound Effects.zip. Source archive supplied in the workspace; original download date unknown. Source page and archive membership verified 2026-09-22.
Only the six derived files below are shipped. The 1950 Computer pack is not used.
The mouse mechanisms are edited sound design, not claimed recordings of a 1991 keyboard or disk.

| Game filename | Original filename | Source / creator / license | Edits |
| --- | --- | --- | --- |
"""
for name,relative,edits in rows: header += f"| {name} | {relative} | Owlish Media pack (URL above) / OwlishMedia / CC0 | {edits} |\n"
(OUTPUT/"ASSETS.md").write_text(header,encoding="utf-8")
(OUTPUT/"source-checksums.json").write_text(json.dumps(verification,indent=2),encoding="utf-8")
print(json.dumps({"files":len(rows),"bytes":sum(p.stat().st_size for p in OUTPUT.glob("*.ogg")),"key_onsets_seconds":[round(p*220/22050,3) for p in peaks[:3]]}))

