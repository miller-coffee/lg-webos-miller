"""Extract complete generated pose components; preserve one scale and row baselines."""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import json
from pathlib import Path

source = Image.open('diagnostics/bunny-generated-source.png').convert('RGBA')
package = Path('output/bunny-sprites')
(package / 'frames').mkdir(parents=True, exist_ok=True)
pixels = np.array(source)
mask = pixels[:, :, 3] > 180
h, w = mask.shape
seen = np.zeros((h, w), bool)
groups = []
for y, x in zip(*np.where(mask)):
    if seen[y, x]:
        continue
    stack = [(int(x), int(y))]
    seen[y, x] = True
    points = []
    while stack:
        px, py = stack.pop()
        points.append((px, py))
        for nx, ny in ((px-1, py), (px+1, py), (px, py-1), (px, py+1)):
            if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((nx, ny))
    if len(points) > 1500:
        xs, ys = zip(*points)
        groups.append({'bounds': (min(xs), min(ys), max(xs)+1, max(ys)+1), 'points': points})
assert len(groups) == 48, f'Expected 48 complete poses, found {len(groups)}'
rows = [[] for _ in range(6)]
for group in groups:
    box = group['bounds']
    row = min(5, int(((box[1]+box[3])/2) / (h/6)))
    rows[row].append(group)
states = ['idle', 'dance', 'wave', 'hop', 'run', 'sleepy']
atlas = Image.new('RGBA', (1536, 1152))
previews = []
manifest = {'columns': 8, 'rows': 6, 'cellSize': 192, 'scale': .8, 'states': {}, 'source': 'bunny-generated-source.png'}
for row, groups in enumerate(rows):
    assert len(groups) == 8, f'Row {row} has {len(groups)} frames'
    groups.sort(key=lambda group: group['bounds'][0])
    baseline = max(group['bounds'][3] for group in groups)
    frames = []
    for col, group in enumerate(groups):
        x0, y0, x1, y1 = group['bounds']
        box = (max(0,x0-2), max(0,y0-2), min(w,x1+2), min(h,y1+2))
        component = Image.new('L', (w,h))
        componentPixels = component.load()
        for px, py in group['points']:
            componentPixels[px,py] = 255
        # Retain original antialiasing adjacent to the connected character only.
        component = component.filter(ImageFilter.MaxFilter(5)).crop(box)
        pose = source.crop(box)
        a = np.array(pose)
        a[:,:,3] = np.minimum(a[:,:,3], np.array(component))
        pose = Image.fromarray(a).resize((round(pose.width*.8), round(pose.height*.8)), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA',(192,192))
        left = (192-pose.width)//2
        top = round(183-(baseline-box[1])*.8)
        assert top >= 0 and left >= 0 and top+pose.height <= 192
        frame.alpha_composite(pose,(left,top))
        atlas.alpha_composite(frame,(col*192,row*192))
        frame.save(package / 'frames' / f'{states[row]}-{col+1:02}.png')
        frames.append(frame)
    delay = 112 if row in (3,4) else 233 if row == 0 else 204 if row == 5 else 163
    manifest['states'][states[row]] = {'row': row, 'frames': 8, 'fps': 1000/delay, 'frameDelayMs': delay}
    frames[0].save('diagnostics/bunny-'+states[row]+'.gif',save_all=True,append_images=frames[1:],duration=delay,loop=0,disposal=2)
    previews.append(frames)
atlas.save('app/assets/bunny/sprites.png',optimize=True)
atlas.save(package / 'sprites.png', optimize=True)
Path('app/assets/bunny/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(package / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# A dark motion preview makes transparency and pose continuity easy to inspect.
film=[]
durations=[]
for action in range(6):
    for repeat in range(2):
        for frame in previews[action]:
            canvas=Image.new('RGB',(384,256),'#18232c')
            canvas.paste(frame,(96,34),frame)
            ImageDraw.Draw(canvas).text((16,16),states[action],fill='#c3e1d2')
            film.append(canvas)
            durations.append(112 if action in (3,4) else 233 if action == 0 else 204 if action == 5 else 163)
film[0].save('diagnostics/bunny-all-actions.gif',save_all=True,append_images=film[1:],duration=durations,loop=0)
film[0].save(package / 'all-actions.gif',save_all=True,append_images=film[1:],duration=durations,loop=0)
print(json.dumps({'poses':48,'states':states,'atlas':atlas.size,'bytes':Path('app/assets/bunny/sprites.png').stat().st_size}))
