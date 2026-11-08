"""Extract the generated 16-frame carrot sequence and extend the existing atlas."""
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import json
from pathlib import Path

root = Path('output/bunny-sprites')
source = Image.open(root / 'carrot-source.png').convert('RGBA')
mask = np.array(source)[:,:,3] > 180
h,w = mask.shape
seen = np.zeros((h,w),bool)
groups = []
for y,x in zip(*np.where(mask)):
    if seen[y,x]: continue
    stack=[(int(x),int(y))]; seen[y,x]=True; points=[]
    while stack:
        px,py=stack.pop();points.append((px,py))
        for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
            if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not seen[ny,nx]:
                seen[ny,nx]=True;stack.append((nx,ny))
    if len(points)>5000:
        xs,ys=zip(*points)
        groups.append({'box':(min(xs),min(ys),max(xs)+1,max(ys)+1),'points':points})
assert len(groups)==16, f'Expected 16 complete poses, found {len(groups)}'
rows=[[] for _ in range(4)]
for group in groups:
    box=group['box']; rows[min(3,int((box[1]+box[3])/2/(h/4)))].append(group)
for row in rows:
    assert len(row)==4
    row.sort(key=lambda group:group['box'][0])
groups=[group for row in rows for group in row]
scale=144/max(group['box'][3]-group['box'][1] for group in groups)
atlas=Image.new('RGBA',(1536,1536))
atlas.alpha_composite(Image.open('app/assets/bunny/sprites.png').crop((0,0,1536,1152)))
frames=[]
for index,group in enumerate(groups):
    x0,y0,x1,y1=group['box']
    box=(max(0,x0-2),max(0,y0-2),min(w,x1+2),min(h,y1+2))
    component=Image.new('L',(w,h)); cp=component.load()
    for px,py in group['points']:cp[px,py]=255
    component=component.filter(ImageFilter.MaxFilter(5)).crop(box)
    pose=source.crop(box);a=np.array(pose);a[:,:,3]=np.minimum(a[:,:,3],np.array(component))
    pose=Image.fromarray(a).resize((round(pose.width*scale),round(pose.height*scale)),Image.Resampling.LANCZOS)
    frame=Image.new('RGBA',(192,192));frame.alpha_composite(pose,((192-pose.width)//2,183-pose.height))
    frame.save(root/'frames'/f'carrot-{index+1:02}.png')
    atlas.alpha_composite(frame,((index%8)*192,(6+index//8)*192));frames.append(frame)
atlas.save('app/assets/bunny/sprites.png',optimize=True);atlas.save(root/'sprites.png',optimize=True)
manifest=json.loads(Path('app/assets/bunny/manifest.json').read_text())
manifest['rows']=8
manifest['states']['carrot']={'row':6,'frames':16,'fps':5,'frameDelayMs':200,'loop':False}
for path in [Path('app/assets/bunny/manifest.json'),root/'manifest.json']:
    path.write_text(json.dumps(manifest,indent=2)+'\n')
film=[];durations=[]
for frame in frames:
    canvas=Image.new('RGB',(384,256),'#18232c');canvas.paste(frame,(96,34),frame)
    film.append(canvas);durations.append(200)
durations[-1]=1000
film[0].save(root/'carrot.gif',save_all=True,append_images=film[1:],duration=durations,loop=0)
# Refresh the full motion preview from the final atlas and authoritative timings.
film=[];durations=[]
for state,info in manifest['states'].items():
    for index in range(info['frames']):
        col=index%8;row=info['row']+index//8
        frame=atlas.crop((col*192,row*192,(col+1)*192,(row+1)*192))
        canvas=Image.new('RGB',(384,256),'#18232c');canvas.paste(frame,(96,34),frame)
        ImageDraw.Draw(canvas).text((16,16),state,fill='#c3e1d2')
        film.append(canvas);durations.append(info['frameDelayMs'])
film[0].save(root/'all-actions.gif',save_all=True,append_images=film[1:],duration=durations,loop=0)
print(json.dumps({'carrotFrames':len(frames),'totalFrames':64,'atlas':atlas.size,'sharedScale':scale}))
