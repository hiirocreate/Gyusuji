"""追加キャラ（ホルン=狩人 / コトコ=料理人）。gen/sprites.py の部品・描画をそのまま使う。

使い方: python3 gen/heroes_extra.py <出力先> [hero_hunter|hero_chef]
出力: <出力先>/hero_*.png（64px 4×4シート）と hero_*_art.png（1024px 立ち絵）
"""
import sys, math, importlib.util
import numpy as np
from PIL import Image
spec = importlib.util.spec_from_file_location('sprites', str(__import__('pathlib').Path(__file__).with_name('sprites.py')))
sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)
S, V3, rot, look, body, mass, eyes, spike = sp.S, sp.V3, sp.rot, sp.look, sp.body, sp.mass, sp.eyes, sp.spike

def hunter(ph):
    """狩人：牛柄フード（角と耳つき）の弓使い。赤茶の狩猟服、背中に矢筒、短弓"""
    P,h,hc,hr=body(ph,'#a0402a','#4e342e','#3e2723',mitten='#8d6e63',belt='#3e2723')
    # 髪（フードの窓からのぞく前髪）
    P.append(mass(hc,hr,'#5d4037',window=(0.66,0.62,0.5),r=(1.02,0.97,1.0),bulge=False,
                  bangs=((-0.36,0.42),(-0.1,0.52),(0.16,0.48),(0.4,0.38))))
    # 牛柄フード：一つの塊から顔の窓を削る
    hood=mass(hc,hr,'#fafafa',window=(0.88,0.78,0.66),wy=-0.24,r=(1.17,1.1,1.15),lift=0.12,back=0.1,bangs=(),bulge=False,facet=(5,10),spec=0.15)
    P.append(hood)
    # 牛柄の黒い斑点（フード表面に貼る薄い楕円）
    hcen=hc+V3(0,0.12,-0.1)*hr
    for (x,y,z,r_) in ((-0.5,0.8,-0.3,0.4),(0.62,0.35,-0.6,0.36),(0.05,0.3,-1.0,0.42),(-0.9,0.15,0.0,0.28),(0.35,0.95,0.25,0.26),(0.85,0.6,0.1,0.22)):
        n=V3(x,y,z); n=n/np.linalg.norm(n)
        rad=np.array([1.17,1.1,1.15])*hr
        surf=hcen+n*(1/np.sqrt(((n/rad)**2).sum()))
        P.append(S('ell',surf,'#262626',R=sp.frame3(n,V3(0.3,0.2,1.0)),r=(r_*hr,0.06*hr,r_*hr*0.8),facet=(3,8),spec=0.1))
    # 角（大きめ、外へ張って先が上）と垂れた耳
    for s in (-1,1):
        b0=hc+V3(0.72*s,0.78,-0.1)*hr; m1=b0+V3(0.17*s,0.04,0); tip=m1+V3(0.05*s,0.15,0.02)
        R,L=look(b0,m1); P.append(S('cone',b0,'#fff3e0',R=R,h=L,ra=0.055,rb=0.04,facet=(2,6),spec=0.3))
        R,L=look(m1,tip); P.append(S('cone',m1,'#fff3e0',R=R,h=L,ra=0.04,rb=0.003,facet=(2,6),spec=0.3))
        P.append(S('ell',hc+V3(1.1*s,0.3,-0.2)*hr,'#fafafa',R=rot('z',0.7*s),r=(0.24*hr,0.12*hr,0.16*hr),facet=(3,8)))
        P.append(S('ell',hc+V3(1.13*s,0.29,-0.15)*hr,'#f8bbd0',R=rot('z',0.7*s),r=(0.17*hr,0.07*hr,0.11*hr),facet=(3,8)))
    eyes(P,hc,hr)
    # 首元の鈴（カウベル）
    P.append(S('tor',(0,0.52,0.0),'#5d4037',r1=0.115,r2=0.022,facet=(4,10)))
    P.append(S('cone',(0,0.42,0.13),'#ffca28',h=0.07,ra=0.045,rb=0.025,facet=(3,8),spec=0.8))
    # 背中の矢筒と矢羽根
    R,L=look((-0.06,0.2,-0.16),(0.08,0.58,-0.2))
    P.append(S('cap',(-0.06,0.2,-0.16),'#6d4c41',R=R,r=0.045,h=L,facet=(3,8)))
    for k,(dx,dz) in enumerate(((0.06,-0.19),(0.1,-0.22),(0.03,-0.23))):
        P.append(S('oct',(dx+0.02,0.64+0.02*k,dz),'#e53935',R=rot('z',-0.3),sz=0.04,sc=(0.5,1.4,0.3)))
    # 短弓（左手）
    st=h[0]; c=st+V3(0.03,0.08,0.05)
    P.append(S('grp',(0,0,0),'#8d5a2b',ch=[
        S('tor',c,'#8d5a2b',R=rot('z',math.pi/2)@rot('y',math.pi/2),r1=0.22,r2=0.024,facet=(3,10)),
        S('box',c+V3(0,0,-0.21),'#8d5a2b',op='sub',b=(0.1,0.3,0.21))],facet=(3,10)))
    R,L=look(c+V3(0,-0.21,0.0),c+V3(0,0.21,0.0))
    P.append(S('cap',c+V3(0,-0.21,0.0),'#eeeeee',R=R,r=0.004,h=L,facet=0))
    return P

def chef(ph):
    """料理人：背の高いコック帽の料理番。白い上着に赤いスカーフ、牛すじ鍋用の大きなフライパン"""
    P,h,hc,hr=body(ph,'#fafafa','#455a64','#3e2723',belt='#d84315',stout=1.1)
    P.append(mass(hc,hr,'#ff8f00',cut=0.3,r=(1.0,0.95,1.0),bulge=False,bangs=((-0.42,0.42),(-0.15,0.5),(0.15,0.48),(0.42,0.4))))
    m=hc+V3(0,0.3,-0.03)*hr
    P.append(S('cone',m,'#ffffff',h=0.7*hr,ra=1.03*hr,rb=0.9*hr,rr=0.01,facet=(3,12),spec=0.1))   # 帽子の筒（髪の切り口を覆う）
    for (x,z) in ((0,0),(-0.5,0.1),(0.5,0.1),(0,-0.45),(-0.35,-0.35),(0.35,-0.35),(0,0.4)):            # ふくらんだ天辺
        P.append(S('sph',m+V3(x,1.2,z)*hr,'#ffffff',op='blend',k=0.03,r=0.55*hr,facet=(4,8),spec=0.1))
    eyes(P,hc,hr)
    P.append(S('tor',(0,0.53,0.0),'#e53935',r1=0.12,r2=0.04,facet=(4,10)))                             # 赤いスカーフ
    P.append(S('oct',(0,0.47,0.13),'#e53935',sz=0.05,sc=(1,1.2,0.4)))
    for y in (0.42,0.33): P.append(S('sph',(0.05,y,0.165),'#ffb300',r=0.016,facet=0,spec=0.6))          # 金ボタン
    P.append(S('box',(0,0.22,0.15),'#fff3e0',b=(0.12,0.09,0.01),rr=0.006))                               # 前掛け
    # フライパン（右手）：黒い平鍋＋持ち手、中に牛すじ（茶色の小粒）
    st=h[1]; pc=st+V3(0.04,0.1,0.22)
    P.append(S('cap',st,'#5d4037',R=look(st,pc)[0],r=0.018,h=np.linalg.norm(pc-st)*0.7,facet=(2,6)))
    P.append(S('ell',pc,'#37474f',R=rot('x',-0.5),r=(0.14,0.03,0.14),facet=(3,12),spec=0.7))
    for (dx,dz) in ((-0.04,0.0),(0.03,0.03),(0.04,-0.04),(-0.01,-0.05)):
        P.append(S('oct',pc+V3(dx,0.04,dz),'#8d4a2b',sz=0.03,sc=(1.3,0.8,1)))
    return P

NEW={'hero_hunter':hunter,'hero_chef':chef}
if __name__=='__main__':
    out=sys.argv[1]; only=set(sys.argv[2:])
    for k,f in NEW.items():
        if only and k not in only: continue
        sp.art(f,1.4).save(f'{out}/{k}_art.png')
        W=Image.new('RGBA',(sp.FRAME*4,sp.FRAME*4))
        for r,yaw in enumerate(sp.DIRS):
            for c in range(4): W.alpha_composite(sp.frame(f,2*math.pi*c/4,yaw,1.4),(c*sp.FRAME,r*sp.FRAME))
        W.save(f'{out}/{k}.png'); print(k,flush=True)
