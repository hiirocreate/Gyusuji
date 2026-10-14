import json,random,sys
W,H=92,72
rnd=random.Random(20261014)
D={'up':(0,-1),'right':(1,0),'down':(0,1),'left':(-1,0)}
def seg(pts):
    out=[pts[0]]
    for (x0,y0),(x1,y1) in zip(pts,pts[1:]):
        dx=(x1>x0)-(x1<x0); dy=(y1>y0)-(y1<y0); x,y=x0,y0
        while (x,y)!=(x1,y1): x+=dx;y+=dy; out.append((x,y))
    return out
def dirname(a,b): return {v:k for k,v in D.items()}[(b[0]-a[0],b[1]-a[1])]
routes={
 'main1':seg([(45,66),(45,58),(20,58),(20,46),(40,46),(40,42)]),
 'easy1':seg([(41,42),(56,42),(56,28),(41,28)]),
 'hard1':seg([(39,42),(28,42),(28,28),(39,28)]),
 'main2':seg([(40,28),(40,20),(70,20),(70,34)]),
 'easy2':seg([(71,34),(84,34),(84,50),(71,50)]),
 'hard2':seg([(69,34),(58,34),(58,50),(69,50)]),
 'main3':seg([(70,50),(70,54),(86,54),(86,8),(10,8),(10,29)]),
}
ctrl={};zone={}
def lay(r,nxt,name):
    for i,p in enumerate(r):
        n=r[i+1] if i+1<len(r) else nxt
        if n: ctrl[p]=dirname(p,n)
        zone[p]=name
lay(routes['main1'],None,'main');lay(routes['easy1'],(40,28),'easy');lay(routes['hard1'],(40,28),'hard')
lay(routes['main2'],None,'main');lay(routes['easy2'],(70,50),'easy');lay(routes['hard2'],(70,50),'hard')
lay(routes['main3'],None,'late')
ctrl[(45,66)]='start';ctrl[(40,42)]='branch';ctrl[(70,34)]='branch'
bosses={(40,23):('boss1',(40,22),'midboss_beast'),(86,13):('boss2',(86,12),'midboss_demon'),(30,8):('boss3',(29,8),'midboss_dragon'),(10,27):('lastboss',(10,28),'lastboss_king')}
objs=[]
for c,(k,bp,t) in bosses.items():
    ctrl[c]=k; objs.append({'x':bp[0],'y':bp[1],'type':t})
# drop squares beyond last boss
for p in [(10,29)]: ctrl.pop(p,None)
# validate walk
def walk(choice):
    p=(45,66);v='up';steps=0;seen=set()
    while steps<2000:
        c=ctrl.get(p)
        if c is None: return None
        if c in D: v=c
        elif c=='branch': v=choice
        elif c in('boss1','boss2','boss3'): pass
        elif c=='lastboss': return steps
        p=(p[0]+D[v][0],p[1]+D[v][1]);steps+=1
        if p in [b[1] for b in bosses.values()]: p=(p[0]+D[v][0],p[1]+D[v][1]);steps+=1  # boss defeated -> passes
    return None
r1,r2=walk('right'),walk('left'); print('steps easy',r1,'hard',r2,'squares',len(ctrl)); assert r1 and r2
path=set(ctrl)
bossset={b[1] for b in bosses.values()}
special={p for p,c in ctrl.items() if c not in D}
# progress index
order=list(routes['main1'])+routes['easy1']+routes['hard1']+routes['main2']+routes['easy2']+routes['hard2']+routes['main3']
prog={p:i/len(order) for i,p in enumerate(order)}
occupied=set(path)|bossset
for p in path:
    if p in special or any((p[0]+d[0],p[1]+d[1]) in special for d in D.values()): continue
    z=zone[p]; r=rnd.random()
    road=[('tack',.07),('tack_big',.03 if z!='hard' else .07),('gold_small',.05),('gold_large',.06 if z!='hard' else .12)]
    acc=0
    for t,w in road:
        acc+=w
        if r<acc: objs.append({'x':p[0],'y':p[1],'type':t});break
# NPCs next to path
def tier(p):
    g=prog.get(p,0)
    if g<.3: return ['enemy_slime','enemy_slime','enemy_crab']
    if g<.6: return ['enemy_crab','enemy_plant','enemy_golem']
    return ['enemy_plant','enemy_golem','enemy_shadow']
weights={'main':[('treasure',30),('priest',10),('shop',10),('inn',7),('shoes',5),('qbox',8),('enemy',18),('smith',2),('casino',2)],
 'easy':[('treasure',25),('priest',12),('shop',15),('inn',12),('shoes',6),('qbox',6),('enemy',8),('casino',4)],
 'hard':[('treasure',40),('priest',4),('shop',4),('inn',2),('qbox',10),('enemy',40)],
 'late':[('treasure',30),('priest',12),('shop',8),('inn',8),('shoes',3),('qbox',10),('enemy',25),('smith',4)]}
cand=sorted(path-special,key=lambda p:prog.get(p,0))
last=-9
for i,p in enumerate(cand):
    if i-last<3 or rnd.random()<.45: continue
    for dn,(dx,dy) in rnd.sample(list(D.items()),4):
        q=(p[0]+dx,p[1]+dy)
        if q in occupied or not(1<=q[0]<W-1 and 1<=q[1]<H-1): continue
        if any((q[0]+a,q[1]+b) in special for a,b in D.values()): continue
        ws=weights[zone[p]]; t=rnd.choices([w[0] for w in ws],[w[1] for w in ws])[0]
        if t=='enemy': t=rnd.choice(tier(p))
        face={'up':'down','down':'up','left':'right','right':'left'}[dn]
        objs.append({'x':q[0],'y':q[1],'type':t,'dir':face}); occupied.add(q); last=i;break
# terrain v2: 0 sea 1 grass 2 forest 3 mountain 4 sand
ter=[0]*(W*H)
for y in range(H):
    for x in range(W):
        if 3<=x<W-3 and 3<=y<H-3: ter[y*W+x]=1
for y in range(H):
    for x in range(W):
        if ter[y*W+x]==1 and (x,y) not in occupied and min(abs(x-a)+abs(y-b) for a,b in list(path)[::3])>2:
            r=rnd.random(); ter[y*W+x]=3 if r<.25 else 2 if r<.45 else 1
for x in range(3,W-3):
    for y in (3,H-4): ter[y*W+x]=4
for y in range(3,H-3):
    for x in (3,W-4): ter[y*W+x]=4
pathl=[{'x':p[0],'y':p[1],'c':c,'zone':zone.get(p,'main')} for p,c in sorted(ctrl.items(),key=lambda kv:prog.get(kv[0],0))]
cnt={}
for o in objs: cnt[o['type']]=cnt.get(o['type'],0)+1
print(cnt)
json.dump({'name':'long','width':W,'height':H,'tileSize':40,'terrainSet':'v2','terrainLegend':{'0':'sea','1':'grass','2':'forest','3':'mountain','4':'sand'},'terrain':ter,'objects':objs,'path':pathl},open(sys.argv[1],'w'),ensure_ascii=False,separators=(',',':'))
