"""High-resolution, bold-silhouette replacement icons for BEEF HUNTER.

Run after gen/effects.py. Produces separate 96px/frame atlases without changing
item IDs, game logic, original sheets, or original generated-art sources.
"""
from __future__ import annotations
import json, math
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/client/public/assets/img'
S = 3
F = 96
INK = '#332a43'
WHITE = '#fffdf6'

def frame():
    im = Image.new('RGBA', (F*S, F*S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((18*S, 78*S, 78*S, 89*S), fill=(32, 24, 47, 48))
    return im

def xy(p): return tuple(round(v*S) for v in p)
def poly(d, pts, fill, outline=INK, w=3):
    d.polygon([xy(p) for p in pts], fill=fill)
    if outline: d.line([xy(p) for p in [*pts, pts[0]]], fill=outline, width=w*S, joint='curve')
def line(d, pts, fill, w=3): d.line([xy(p) for p in pts], fill=fill, width=w*S, joint='curve')
def ell(d, box, fill, outline=INK, w=3):
    d.ellipse(tuple(v*S for v in box), fill=fill, outline=outline, width=w*S if outline else 1)
def rr(d, box, r, fill, outline=INK, w=3):
    d.rounded_rectangle(tuple(v*S for v in box), radius=r*S, fill=fill, outline=outline, width=w*S if outline else 1)
def txt(d, at, string, fill, font=None, stroke_width=0, stroke_fill=WHITE):
    from PIL import ImageFont
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14*S) if font is None else font
    d.text(xy(at), string, fill=fill, font=font, anchor='mm', stroke_width=stroke_width*S, stroke_fill=stroke_fill)
def finish(im):
    return im.resize((F, F), Image.Resampling.LANCZOS)

def draw_die(top=5, left=2, right=3, gold=False, tilt=0):
    im=frame(); d=ImageDraw.Draw(im); c='#f8f3e7' if not gold else '#ffd45a'
    # Simple, clean three-face cube; matched dark outline and one vivid red pip.
    a=(48,10); b=(82,29); m=(48,49); q=(14,29); l=(14,68); z=(48,88); r=(82,68)
    poly(d,[a,b,m,q], '#fffdf6' if not gold else '#fff1ae', INK, 3)
    poly(d,[q,m,z,l], '#d7deea' if not gold else '#e7a83a', INK, 3)
    poly(d,[b,r,z,m], '#aebbd0' if not gold else '#d48628', INK, 3)
    def pip(x,y,red=False):
        color='#d63e45' if red else '#33435f'
        ell(d,(x-3.2,y-3.2,x+3.2,y+3.2),color,None)
        ell(d,(x-1.6,y-2.4,x-.2,y-1), '#fff5df' if red else '#f4f6fb', None)
    # Dice pattern positions are set in face-local coordinates.
    def face(points, value, redone=False):
        center=(sum(x for x,_ in points)/4,sum(y for _,y in points)/4)
        dx=(points[1][0]-points[0][0])*0.18; dy=(points[1][1]-points[0][1])*0.18
        ex=(points[3][0]-points[0][0])*0.18; ey=(points[3][1]-points[0][1])*0.18
        loc={1:[(0,0)],2:[(-.55,-.55),(.55,.55)],3:[(-.55,-.55),(0,0),(.55,.55)],4:[(-.55,-.55),(.55,-.55),(-.55,.55),(.55,.55)],5:[(-.55,-.55),(.55,-.55),(0,0),(-.55,.55),(.55,.55)],6:[(-.55,-.55),(.55,-.55),(-.55,0),(.55,0),(-.55,.55),(.55,.55)]}[value]
        for i,(u,v) in enumerate(loc):
            pip(center[0]+u*dx+v*ex,center[1]+u*dy+v*ey,redone and i==0)
    face([a,b,m,q],top,top==1)
    face([q,m,z,l],left,left==1)
    face([b,r,z,m],right,right==1)
    # Small top-left glint and compact base edge.
    line(d,[(20,28),(48,12),(76,28)], '#ffffff' if not gold else '#fff9ce', 1)
    return im

def build_items():
    out=[]
    # 1. Apple, with recognisable twin lobes, stem and leaf.
    im=frame();d=ImageDraw.Draw(im); ell(d,(25,28,71,72),'#e94050',INK,4); ell(d,(31,30,52,56),'#fa6670',None); line(d,[(48,31),(52,18)],'#704334',4); poly(d,[(51,23),(68,16),(64,27),(55,29)],'#62bd59',INK,2); out.append(im)
    # 2. Potion bottle: glass shoulder, stopper, colored fluid and reflection.
    im=frame();d=ImageDraw.Draw(im); poly(d,[(39,16),(57,16),(57,28),(66,36),(70,65),(63,75),(33,75),(26,65),(30,36),(39,28)],'#d8f6ff',INK,4); rr(d,(38,11,58,23),3,'#d79655',INK,3); poly(d,[(31,51),(65,51),(67,64),(62,70),(34,70),(29,64)],'#bd58d9',INK,2); line(d,[(36,36),(33,48)],'#fff',3); ell(d,(41,54,45,58),'#f8d5ff',None); out.append(im)
    # 3. Gold amulet pendant around blue gem.
    im=frame();d=ImageDraw.Draw(im); line(d,[(34,20),(34,31),(48,39),(62,31),(62,20)],'#ffcf56',4); ell(d,(33,36,63,67),'#ffca49',INK,4); poly(d,[(48,40),(59,51),(48,63),(37,51)],'#40c9ef',INK,3); poly(d,[(48,44),(54,51),(48,57)],'#b3f4ff',None); out.append(im)
    # 4-5. Clean simple face dice, not ornate 3-D models.
    out.append(draw_die(5,2,3)); out.append(draw_die(1,2,3,True))
    # 6-8. Daggers and swords: distinct blade material and hero gem.
    for blade,hilt,gem in [('#bfcbd9','#9b6043',None),('#dce8f8','#465c77',None),('#fff1ba','#a64d40','#f14d65')]:
        im=frame();d=ImageDraw.Draw(im); poly(d,[(48,14),(61,43),(52,48),(48,44),(44,48),(35,43)],blade,INK,3); line(d,[(48,18),(52,41)],'#fff',2); line(d,[(35,48),(61,48)],hilt,5); rr(d,(44,49,52,69),4,hilt,INK,3); ell(d,(43,67,53,77),hilt,INK,2)
        if gem: ell(d,(44,51,52,59),gem,WHITE,2)
        out.append(im)
    # 9-11. Wood, steel and royal kite shields.
    for col,trim,gem in [('#ae7049','#f5c879',None),('#92abc5','#eef4ff',None),('#345fe8','#ffd653','#ee5668')]:
        im=frame();d=ImageDraw.Draw(im); poly(d,[(25,23),(71,23),(68,55),(48,76),(28,55)],col,INK,4); poly(d,[(32,30),(64,30),(61,53),(48,66),(35,53)],trim,WHITE,2); poly(d,[(37,34),(59,34),(57,51),(48,60),(39,51)],col,INK,1); ell(d,(43,39,53,51),gem or '#efbd50',WHITE,2); out.append(im)
    # 12-13. Bright running sneaker and sturdy safety boot.
    for col,wing in [('#ef4c5f',True),('#f29131',False)]:
        im=frame();d=ImageDraw.Draw(im); poly(d,[(24,29),(39,30),(44,42),(54,46),(72,53),(70,66),(28,68),(22,60)],col,INK,4); poly(d,[(25,58),(69,58),(72,66),(67,72),(26,71),(21,66)],'#fff8dc',INK,3); line(d,[(41,36),(50,47),(61,52)],'#ffe8a5',3); line(d,[(37,43),(50,51)],WHITE,2)
        if wing:
            poly(d,[(44,35),(37,23),(45,27),(47,16),(53,27),(60,20),(58,38)],'#fff6d5','#a54a57',2)
        else: rr(d,(35,22,57,34),4,'#667b9d',INK,2)
        out.append(im)
    # 14-17. Spellbooks in green, scarlet, amber, violet.
    for cover,symbol in [('#40a968','✚'),('#ef5254','▲'),('#f2aa35','★'),('#8559c8','✦')]:
        im=frame();d=ImageDraw.Draw(im); poly(d,[(25,28),(48,34),(70,26),(70,65),(48,72),(25,65)],cover,INK,4); line(d,[(48,34),(48,72)],'#ffe9aa',2); poly(d,[(30,34),(46,38),(46,65),(30,60)],'#fff2d3','#755e66',1); poly(d,[(50,38),(65,33),(65,60),(50,65)],'#ffe8b9','#755e66',1); ell(d,(39,40,58,59),'#fff8df','#b56c45',2); txt(d,(48,50),symbol,cover)
        out.append(im)
    # 18. Sword sigil attack orb; 19. rainbow burst orb.
    for col,mark in [('#ef535e','⚔'),('#66dcf3','✦')]:
        im=frame();d=ImageDraw.Draw(im); ell(d,(22,20,74,72),col,INK,4); ell(d,(29,26,48,45),'#ffffff70',None); ell(d,(34,30,63,60),'#fff4d8',WHITE,2); txt(d,(50,44),mark,'#c33c56');
        if col=='#66dcf3':
            for a,c in enumerate(['#f45a65','#ffc647','#70cd74','#568fee','#9f67dc']):
                angle=a*2*math.pi/5; ell(d,(48+math.cos(angle)*20-3,46+math.sin(angle)*18-3,48+math.cos(angle)*20+3,46+math.sin(angle)*18+3),c,None)
        out.append(im)
    # 20. Yellow chick with recognizable beak, wing, eye and feet.
    im=frame();d=ImageDraw.Draw(im); ell(d,(30,38,67,73),'#ffd956',INK,4); ell(d,(41,17,68,47),'#ffdf63',INK,4); ell(d,(55,27,60,33),INK,None); poly(d,[(65,34),(78,39),(65,43)],'#f5833d',INK,2); ell(d,(30,46,48,62),'#fff1a5','#d39d3b',2); line(d,[(40,70),(37,77)],'#f1843f',3); line(d,[(56,70),(59,77)],'#f1843f',3); out.append(im)
    # 21. Absorb vortex orb; 22. purple curse orb.
    for col,mark in [('#34ccdd','↗'),('#8c59d6','!')]:
        im=frame();d=ImageDraw.Draw(im); ell(d,(24,22,72,70),col,INK,4); ell(d,(32,29,50,47),'#ffffffbb',None); ell(d,(39,37,61,59),'#fff7d8',WHITE,2); txt(d,(50,48),mark,'#65509c'); out.append(im)
    # 23. Dragon mail chestplate with scale rows.
    im=frame();d=ImageDraw.Draw(im); poly(d,[(27,28),(40,22),(48,31),(56,22),(69,28),(66,54),(58,65),(38,65),(30,55)],'#3f9b65',INK,4); poly(d,[(27,29),(40,22),(48,31),(56,22),(69,29),(63,38),(33,38)],'#68c87d','#e8efce',2)
    for yy in [42,51]:
        for xx in [39,49,59]: poly(d,[(xx-4,yy-2),(xx,yy+3),(xx+4,yy-2)],'#b7ec86','#306c62',1)
    out.append(im)
    # 24. Magical scroll with curled ends and a clear blue rune.
    im=frame();d=ImageDraw.Draw(im); rr(d,(27,26,69,69),5,'#fff1ca',INK,4); ell(d,(24,24,34,72),'#e8c16c',INK,3); ell(d,(62,24,72,72),'#e8c16c',INK,3); line(d,[(39,36),(58,36)],'#b98c50',2); line(d,[(39,44),(56,44)],'#b98c50',2); poly(d,[(48,48),(56,56),(48,64),(40,56)],'#438ce9',WHITE,2); out.append(im)
    # 25. Little wooden substitute doll with red scarf.
    im=frame();d=ImageDraw.Draw(im); ell(d,(31,18,65,49),'#f5e5d2',INK,4); rr(d,(37,39,59,68),8,'#b68152',INK,4); ell(d,(39,30,44,36),INK,None); ell(d,(53,30,58,36),INK,None); line(d,[(41,45),(55,45)],'#d8415b',4); poly(d,[(34,45),(27,51),(35,55),(43,49)],'#eb4c59',INK,2); line(d,[(40,64),(36,73)],'#73523e',4); line(d,[(56,64),(60,73)],'#73523e',4); out.append(im)
    assert len(out)==25, len(out)
    atlas=Image.new('RGBA',(F*len(out),F),(0,0,0,0))
    for i,im in enumerate(out): atlas.alpha_composite(finish(im),(i*F,0))
    atlas.save(OUT/'items/icons-hd.png', optimize=True)

def build_dice():
    faces=Image.new('RGBA',(F*6,F),(0,0,0,0))
    side_faces={1:(2,3),2:(6,3),3:(2,6),4:(6,5),5:(4,2),6:(3,2)}
    for i,n in enumerate([1,2,3,4,5,6]): faces.alpha_composite(finish(draw_die(n,*side_faces[n])),(F*i,0))
    faces.save(OUT/'dice/faces-hd.png', optimize=True)
    # One complete tumble through several changing top-face angles; 8 distinct frames.
    seq=[draw_die(1,2,3),draw_die(2,6,3),draw_die(5,4,2),draw_die(3,4,6),draw_die(6,1,2),draw_die(4,5,3),draw_die(2,1,5),draw_die(5,2,4)]
    roll=Image.new('RGBA',(F*len(seq),F),(0,0,0,0))
    for i,im in enumerate(seq):
        rot=im.rotate(45*(i+1), Image.Resampling.BICUBIC, expand=False)
        # Compressed squash is a light visual cue that the die is tipping forward.
        rot=rot.resize((F, round(F*(0.88+0.12*abs(math.sin(i*math.pi/4)))),),Image.Resampling.LANCZOS)
        y=(F-rot.height)//2
        roll.alpha_composite(rot,(F*i,y))
    roll.save(OUT/'dice/roll-hd.png', optimize=True)
    finish(draw_die(1,2,3,gold=True)).save(OUT/'dice/ichi-hd.png', optimize=True)

def build_objects():
    drawings={}
    # Wide, hinged chest with a bright clasp and visible open treasure interior.
    for open_ in [False,True]:
        im=frame();d=ImageDraw.Draw(im)
        poly(d,[(18,46),(78,46),(75,72),(22,72)],'#a65738',INK,4)
        poly(d,[(24,50),(72,50),(69,67),(27,67)],'#d78742','#633b38',2)
        rr(d,(42,49,54,70),3,'#ffd05c',INK,2); ell(d,(46,55,50,59),'#fff5c8',None)
        if open_:
            poly(d,[(19,42),(24,22),(70,22),(77,42),(70,48),(25,48)],'#874238',INK,4)
            poly(d,[(26,38),(29,27),(66,27),(70,38)],'#bf7150','#f0bc74',2)
            ell(d,(35,35,47,47),'#ffe066',None); ell(d,(46,31,59,45),'#48c9dd',None)
        else:
            poly(d,[(18,45),(22,30),(33,22),(63,22),(74,30),(78,45)],'#c87943',INK,4)
            line(d,[(24,31),(72,31)],'#edb85d',3); rr(d,(43,34,53,52),3,'#ffd258',INK,2)
        drawings['chest_open-hd' if open_ else 'chest-hd']=im
    # Purple question block; unmistakable question mark, no ambiguous cube glyph.
    im=frame();d=ImageDraw.Draw(im); poly(d,[(24,22),(68,22),(76,30),(76,68),(68,76),(24,76),(17,68),(17,30)],'#8754d4',INK,4); rr(d,(23,27,72,71),9,'#a477eb','#ffe58a',3); txt(d,(48,47),'?', '#fff6c4', stroke_width=1, stroke_fill='#6740af'); ell(d,(45,59,51,65),'#fff6c4',None); drawings['qbox-hd']=im
    # Shiny thumb tack with a colored round cap and a sharp steel pin.
    im=frame();d=ImageDraw.Draw(im); poly(d,[(47,30),(53,29),(50,69),(48,75)],'#a9b7cb','#52627b',2); line(d,[(50,39),(49,67)],'#fff',2); ell(d,(32,20,64,43),'#ef566a',INK,4); ell(d,(38,23,50,31),'#ffadb0',None); drawings['tack-hd']=im
    im=frame();d=ImageDraw.Draw(im); poly(d,[(47,31),(52,30),(50,71),(48,77)],'#8b9caf','#52627b',2); ell(d,(28,14,68,42),'#ef566a',INK,4); ell(d,(35,18,50,29),'#ffabb4',None)
    for a in [0,2.09,4.19]:
        ex=48+19*math.cos(a);ey=30+13*math.sin(a); line(d,[(48,33),(ex,ey)],'#ffadba',3)
    drawings['tack_big-hd']=im
    # Small coin cluster, centered bag-of-gold and little tie ribbons.
    im=frame();d=ImageDraw.Draw(im)
    for cx,cy in [(34,54),(60,53),(47,46)]: ell(d,(cx-13,cy-13,cx+13,cy+13),'#ffc941',INK,3); ell(d,(cx-8,cy-8,cx+1,cy+1),'#fff0a6',None); ell(d,(cx-3,cy-3,cx+8,cy+8),'#e5a41f',None)
    drawings['gold_small-hd']=im
    im=frame();d=ImageDraw.Draw(im); poly(d,[(28,43),(37,35),(60,35),(69,43),(64,69),(57,76),(38,74),(31,66)],'#e5a73f',INK,4); ell(d,(36,43,60,66),'#ffc846','#ffe8a4',2); line(d,[(38,39),(48,35),(58,40)],'#b64b47',4); poly(d,[(43,37),(38,25),(48,30),(54,22),(56,37)],'#ed4f60',INK,2)
    for cx,cy,r in [(28,67,9),(67,67,9)]: ell(d,(cx-r,cy-r,cx+r,cy+r),'#ffcc43',INK,3); txt(d,(cx,cy),'G','#ac6922')
    drawings['gold_large-hd']=im
    for k,im in drawings.items(): finish(im).save(OUT/f'obj/{k}.png', optimize=True)
    return drawings.keys()

def brighten_heroes():
    """Small palette lift only; re-hue the spellknight's sparse blue details to coral red."""
    chars=OUT/'chars'
    p=chars/'hero_spellknight.png'
    if not p.exists(): return
    im=Image.open(p).convert('RGBA')
    a=np.asarray(im).copy()
    r,g,b,alpha=a.transpose(2,0,1)
    m=(alpha>0)&(b>g*1.12)&(b>r*1.2)&(b>55)
    lum=(r.astype(float)+g.astype(float)+b.astype(float))/3
    a[...,0][m]=np.clip(lum[m]*1.35+25,0,255).astype('uint8')
    a[...,1][m]=np.clip(lum[m]*.22+8,0,255).astype('uint8')
    a[...,2][m]=np.clip(lum[m]*.27+14,0,255).astype('uint8')
    Image.fromarray(a,'RGBA').save(p,optimize=True)

def main():
    (OUT/'brand').mkdir(exist_ok=True)
    build_items(); build_dice(); object_keys=build_objects(); brighten_heroes()
    idx_path=OUT/'assets_index.json'
    idx=json.loads(idx_path.read_text())
    additions={
      'items/icons-hd': {'frame':[96,96],'frames':25,'note':'High-resolution clear-silhouette icon atlas; order matches item numbers 1–25'},
      'dice/faces-hd': {'frame':[96,96],'frames':6,'note':'High-resolution simplified one-to-six dice'},
      'dice/roll-hd': {'frame':[96,96],'frames':8,'note':'High-resolution tumbling dice frames'},
      'dice/ichi-hd': {'frame':[96,96],'frames':1,'note':'High-resolution special guaranteed-one gold die'},
      'brand/beef-rune': {'frame':[512,512],'frames':1,'note':'Transparent game-title beef emblem'},
    }
    for k in object_keys: additions[f'obj/{k}']={'frame':[96,96],'frames':1}
    idx.update(additions)
    idx_path.write_text(json.dumps(idx,ensure_ascii=False,indent=1)+'\n')
    print('Generated high-resolution item, die and map prop assets:', len(additions))

if __name__=='__main__': main()
