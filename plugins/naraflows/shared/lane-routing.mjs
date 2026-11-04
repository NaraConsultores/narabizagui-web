import {same} from './geometry.mjs';

// Separators are open to perpendicular crossings. They are not solid boxes:
// parallel legs and turns need an interior corridor on either side.
export const LANE_BORDER_CLEARANCE=16;
const rect=e=>[e.x,e.y,e.width,e.height].every(Number.isFinite)&&e.width>0&&e.height>0;
export function laneBoundaries(snapshot){
  const lanes=(snapshot.elements||[]).filter(e=>e.type==='bpmn:Lane'&&e.parentId&&rect(e)),borders=[];
  for(let i=0;i<lanes.length;i++)for(let j=i+1;j<lanes.length;j++){
    const a=lanes[i],b=lanes[j];if(a.parentId!==b.parentId)continue;
    for(const axis of ['x','y']){
      const size=axis==='x'?'width':'height',along=axis==='x'?'y':'x',span=axis==='x'?'height':'width';
      let value;if(same(a[axis]+a[size],b[axis]))value=b[axis];else if(same(b[axis]+b[size],a[axis]))value=a[axis];else continue;
      const from=Math.max(a[along],b[along]),to=Math.min(a[along]+a[span],b[along]+b[span]);
      if(to-from>.01)borders.push({axis,value,from,to,laneIds:[a.id,b.id],parentId:a.parentId});
    }
  }
  return borders;
}
export function segmentNearLaneBorder(a,b,border,clearance=LANE_BORDER_CLEARANCE){
  const axis=border.axis,along=axis==='x'?'y':'x';
  return same(a[axis],b[axis])&&Math.abs(a[along]-b[along])>.01&&Math.abs(a[axis]-border.value)<clearance-.01&&Math.min(b[along],a[along])<border.to-.01&&Math.max(b[along],a[along])>border.from+.01;
}
export function pointNearLaneBorder(point,border,clearance=LANE_BORDER_CLEARANCE){
  const along=border.axis==='x'?'y':'x',outside=Math.max(border.from-point[along],0,point[along]-border.to);
  return Math.hypot(point[border.axis]-border.value,outside)<clearance-.01;
}
export function laneRouteConflicts(points,borders,clearance=LANE_BORDER_CLEARANCE){
  const conflicts=[];
  for(const border of borders){
    const parallelSegments=[],bends=[];
    for(let i=1;i<points.length;i++)if(segmentNearLaneBorder(points[i-1],points[i],border,clearance))parallelSegments.push(i-1);
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      // A redundant point on a straight crossing is not a turn.
      if(Math.abs(cross)>.01&&pointNearLaneBorder(b,border,clearance))bends.push(i);
    }
    if(parallelSegments.length||bends.length)conflicts.push({...border,clearance,parallelSegments,bends});
  }
  return conflicts;
}
