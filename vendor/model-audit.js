var NaraModelAudit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // plugins/naraflows/shared/audit.mjs
  var audit_exports = {};
  __export(audit_exports, {
    BATCH_LIMIT: () => BATCH_LIMIT,
    BATCH_OPERATIONS: () => BATCH_OPERATIONS,
    BPMN_CREATE_TYPES: () => BPMN_CREATE_TYPES,
    EVENT_KINDS: () => EVENT_KINDS,
    LANE_BORDER_CLEARANCE: () => LANE_BORDER_CLEARANCE,
    PROTOCOL_VERSION: () => PROTOCOL_VERSION,
    SIDES: () => SIDES,
    TOOL_CONTRACT: () => TOOL_CONTRACT,
    anchorPoint: () => anchorPoint,
    anchorPolicy: () => anchorPolicy,
    boxesOverlap: () => boxesOverlap,
    compareSnapshots: () => compareSnapshots,
    inferAnchor: () => inferAnchor,
    intentionalSharedContact: () => intentionalSharedContact,
    laneBoundaries: () => laneBoundaries,
    laneRouteConflicts: () => laneRouteConflicts,
    lineHitsBox: () => lineHitsBox,
    orthogonalizeWaypoints: () => orthogonalizeWaypoints,
    planContainerFit: () => planContainerFit,
    planMovedRoutes: () => planMovedRoutes,
    planOperations: () => planOperations,
    planReconnectPreview: () => planReconnectPreview,
    projectRoute: () => projectRoute,
    reviewVisualQuality: () => reviewVisualQuality,
    routeMetrics: () => routeMetrics,
    routeOrthogonal: () => routeOrthogonal,
    segmentContact: () => segmentContact,
    segments: () => segments,
    shareConnectionPath: () => shareConnectionPath,
    shareConnectionTail: () => shareConnectionTail,
    simplifyOrthogonal: () => simplifyOrthogonal,
    validateSnapshot: () => validateSnapshot
  });

  // plugins/naraflows/shared/contract.mjs
  var PROTOCOL_VERSION = 5;
  var TOOL_CONTRACT = "visual-quality-v1";
  var BATCH_LIMIT = 200;
  var BATCH_OPERATIONS = ["label", "documentation", "create", "connect", "move", "resize", "move_elements", "route", "route_orthogonal", "share_connection", "compact_container", "fit_text", "style", "delete", "properties", "lane_split", "lane_add", "matrix", "clear"];
  var BPMN_CREATE_TYPES = ["bpmn:Task", "bpmn:ManualTask", "bpmn:UserTask", "bpmn:ServiceTask", "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:ScriptTask", "bpmn:BusinessRuleTask", "bpmn:SubProcess", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:IntermediateCatchEvent", "bpmn:IntermediateThrowEvent", "bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ParallelGateway", "bpmn:ComplexGateway", "bpmn:EventBasedGateway", "bpmn:TextAnnotation", "bpmn:DataObjectReference", "bpmn:DataStoreReference", "bpmn:Participant"];
  var EVENT_KINDS = {
    "bpmn:StartEvent": ["Message", "Timer", "Conditional", "Signal"],
    "bpmn:EndEvent": ["Message", "Signal", "Error", "Escalation", "Terminate", "Compensate"],
    "bpmn:IntermediateCatchEvent": ["Message", "Timer", "Conditional", "Link", "Signal"],
    "bpmn:IntermediateThrowEvent": ["Message", "Signal", "Escalation", "Link", "Compensate"]
  };

  // plugins/naraflows/shared/geometry.mjs
  var same = (a, b) => Math.abs(a - b) < 0.01;
  var pointEqual = (a, b) => same(a.x, b.x) && same(a.y, b.y);
  var cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  var between = (p, a, b) => Math.abs(cross(a, b, p)) < 0.01 && p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01 && p.y >= Math.min(a.y, b.y) - 0.01 && p.y <= Math.max(a.y, b.y) + 0.01;
  var segments = (flow) => (flow.waypoints || []).slice(1).map((p, i) => [flow.waypoints[i], p]);
  function segmentContact(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, denominator = r.x * s.y - r.y * s.x;
    if (Math.abs(denominator) < 1e-4) {
      if (Math.abs(cross(a, b, c)) > 0.01) return null;
      const common = [a, b, c, d].filter((p) => between(p, a, b) && between(p, c, d));
      const unique = common.filter((p, i) => !common.slice(0, i).some((q) => pointEqual(p, q)));
      return unique.length > 1 ? { type: "overlap" } : unique.length ? { type: "contact", point: unique[0] } : null;
    }
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denominator;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
    if (t < -1e-5 || t > 1.00001 || u < -1e-5 || u > 1.00001) return null;
    return { type: t > 1e-5 && t < 0.99999 && u > 1e-5 && u < 0.99999 ? "crossing" : "contact", point: { x: a.x + t * r.x, y: a.y + t * r.y } };
  }
  function lineHitsBox(a, b, box, padding = 0) {
    const left = box.x - padding + 0.01, top = box.y - padding + 0.01, right = box.x + box.width + padding - 0.01, bottom = box.y + box.height + padding - 0.01;
    let low = 0, high = 1;
    for (const [origin, delta, min, max] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
      if (Math.abs(delta) < 1e-5) {
        if (origin < min || origin > max) return false;
      } else {
        const x = (min - origin) / delta, y = (max - origin) / delta;
        low = Math.max(low, Math.min(x, y));
        high = Math.min(high, Math.max(x, y));
        if (low > high) return false;
      }
    }
    return high >= 0 && low <= 1;
  }
  var boxesOverlap = (a, b) => a.x < b.x + b.width - 0.01 && a.x + a.width > b.x + 0.01 && a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01;
  var segmentAlongBox = (a, b, box) => same(a.x, b.x) && (same(a.x, box.x) || same(a.x, box.x + box.width)) && Math.min(a.y, b.y) < box.y + box.height - 0.01 && Math.max(a.y, b.y) > box.y + 0.01 || same(a.y, b.y) && (same(a.y, box.y) || same(a.y, box.y + box.height)) && Math.min(a.x, b.x) < box.x + box.width - 0.01 && Math.max(a.x, b.x) > box.x + 0.01;

  // plugins/naraflows/shared/lane-routing.mjs
  var LANE_BORDER_CLEARANCE = 16;
  var rect = (e) => [e.x, e.y, e.width, e.height].every(Number.isFinite) && e.width > 0 && e.height > 0;
  function laneBoundaries(snapshot) {
    const lanes = (snapshot.elements || []).filter((e) => e.type === "bpmn:Lane" && e.parentId && rect(e)), borders = [];
    for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) {
      const a = lanes[i], b = lanes[j];
      if (a.parentId !== b.parentId) continue;
      for (const axis2 of ["x", "y"]) {
        const size = axis2 === "x" ? "width" : "height", along = axis2 === "x" ? "y" : "x", span = axis2 === "x" ? "height" : "width";
        let value;
        if (same(a[axis2] + a[size], b[axis2])) value = b[axis2];
        else if (same(b[axis2] + b[size], a[axis2])) value = a[axis2];
        else continue;
        const from = Math.max(a[along], b[along]), to = Math.min(a[along] + a[span], b[along] + b[span]);
        if (to - from > 0.01) borders.push({ axis: axis2, value, from, to, laneIds: [a.id, b.id], parentId: a.parentId });
      }
    }
    return borders;
  }
  function segmentNearLaneBorder(a, b, border, clearance = LANE_BORDER_CLEARANCE) {
    const axis2 = border.axis, along = axis2 === "x" ? "y" : "x";
    return same(a[axis2], b[axis2]) && Math.abs(a[along] - b[along]) > 0.01 && Math.abs(a[axis2] - border.value) < clearance - 0.01 && Math.min(b[along], a[along]) < border.to - 0.01 && Math.max(b[along], a[along]) > border.from + 0.01;
  }
  function pointNearLaneBorder(point, border, clearance = LANE_BORDER_CLEARANCE) {
    const along = border.axis === "x" ? "y" : "x", outside = Math.max(border.from - point[along], 0, point[along] - border.to);
    return Math.hypot(point[border.axis] - border.value, outside) < clearance - 0.01;
  }
  function laneRouteConflicts(points, borders, clearance = LANE_BORDER_CLEARANCE) {
    const conflicts = [];
    for (const border of borders) {
      const parallelSegments = [], bends = [];
      for (let i = 1; i < points.length; i++) if (segmentNearLaneBorder(points[i - 1], points[i], border, clearance)) parallelSegments.push(i - 1);
      for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1], b = points[i], c = points[i + 1], cross2 = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cross2) > 0.01 && pointNearLaneBorder(b, border, clearance)) bends.push(i);
      }
      if (parallelSegments.length || bends.length) conflicts.push({ ...border, clearance, parallelSegments, bends });
    }
    return conflicts;
  }

  // plugins/naraflows/shared/routing.mjs
  var SIDES = ["top", "right", "bottom", "left"];
  var vectors = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  var fail = (code, message) => Object.assign(Error(message), { code });
  var rect2 = (e) => e && [e.x, e.y, e.width, e.height].every(Number.isFinite) && e.width > 0 && e.height > 0;
  var distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  var axis = (a, b) => same(a.y, b.y) ? 1 : same(a.x, b.x) ? 2 : 0;
  function simplifyOrthogonal(points) {
    const output = [];
    for (const p of points) {
      if (output.length && pointEqual(output.at(-1), p)) continue;
      while (output.length > 1 && axis(output.at(-2), output.at(-1)) === axis(output.at(-1), p) && axis(output.at(-1), p) && (p.x - output.at(-1).x) * (output.at(-1).x - output.at(-2).x) + (p.y - output.at(-1).y) * (output.at(-1).y - output.at(-2).y) >= 0) output.pop();
      output.push({ x: p.x, y: p.y });
    }
    return output;
  }
  function orthogonalizeWaypoints(points, { sourceSide, targetSide } = {}) {
    if (points.length < 2) return points.map((p) => ({ ...p }));
    if (points.length === 2 && sourceSide && targetSide && ["left", "right"].includes(sourceSide) === ["left", "right"].includes(targetSide) && !same(points[0].x, points[1].x) && !same(points[0].y, points[1].y)) {
      const [a, b] = points, horizontal2 = ["left", "right"].includes(sourceSide), middle = horizontal2 ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
      return simplifyOrthogonal([a, horizontal2 ? { x: middle, y: a.y } : { x: a.x, y: middle }, horizontal2 ? { x: middle, y: b.y } : { x: b.x, y: middle }, b]);
    }
    const output = [{ ...points[0] }];
    let horizontal = ["left", "right"].includes(sourceSide);
    for (let i = 1; i < points.length; i++) {
      const a = output.at(-1), b = points[i];
      if (!same(a.x, b.x) && !same(a.y, b.y)) {
        let firstHorizontal = horizontal;
        if (i === points.length - 1 && targetSide) firstHorizontal = ["top", "bottom"].includes(targetSide);
        output.push(firstHorizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      }
      const previous = output.at(-1);
      if (!pointEqual(previous, b)) horizontal = same(previous.y, b.y);
      output.push({ ...b });
    }
    return simplifyOrthogonal(output);
  }
  function anchorPoint(shape, side, offset = 0.5) {
    if (!rect2(shape) || !SIDES.includes(side) || !Number.isFinite(offset) || offset < 0.05 || offset > 0.95) throw fail("INVALID_ANCHOR", "El anclaje requiere un lado y una posici\xF3n entre 0.05 y 0.95.");
    return side === "top" ? { x: shape.x + shape.width * offset, y: shape.y } : side === "bottom" ? { x: shape.x + shape.width * offset, y: shape.y + shape.height } : side === "left" ? { x: shape.x, y: shape.y + shape.height * offset } : { x: shape.x + shape.width, y: shape.y + shape.height * offset };
  }
  function inferAnchor(shape, point) {
    if (!rect2(shape) || !point) return null;
    const candidates = SIDES.map((side2) => ({ side: side2, distance: side2 === "left" ? Math.abs(point.x - shape.x) : side2 === "right" ? Math.abs(point.x - shape.x - shape.width) : side2 === "top" ? Math.abs(point.y - shape.y) : Math.abs(point.y - shape.y - shape.height) })).sort((a, b) => a.distance - b.distance);
    const side = candidates[0].side, offset = ["top", "bottom"].includes(side) ? (point.x - shape.x) / shape.width : (point.y - shape.y) / shape.height;
    return { side, offset: Math.max(0.05, Math.min(0.95, offset)) };
  }
  function routeMetrics(points) {
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    const reversals = points.slice(2).filter((p, i) => axis(points[i], points[i + 1]) === axis(points[i + 1], p) && (points[i + 1].x - points[i].x) * (p.x - points[i + 1].x) + (points[i + 1].y - points[i].y) * (p.y - points[i + 1].y) < 0).length;
    return { length: lengths.reduce((a, b) => a + b, 0), bends: Math.max(0, points.length - 2), shortLegs: lengths.filter((n) => n < 8).length, reversals, orthogonal: points.slice(1).every((p, i) => axis(points[i], p) !== 0) };
  }
  function anchorPolicy(routing, end) {
    return routing?.anchorPolicy?.[end] || (routing?.[end] ? "fixed" : "auto");
  }
  var Heap = class {
    data = [];
    push(value) {
      let i = this.data.push(value) - 1;
      while (i) {
        const parent = i - 1 >> 1;
        if (this.data[parent].score <= value.score) break;
        this.data[i] = this.data[parent];
        i = parent;
      }
      this.data[i] = value;
    }
    pop() {
      const first = this.data[0], last = this.data.pop();
      if (this.data.length) {
        let i = 0;
        while (i * 2 + 1 < this.data.length) {
          let child = i * 2 + 1;
          if (child + 1 < this.data.length && this.data[child + 1].score < this.data[child].score) child++;
          if (this.data[child].score >= last.score) break;
          this.data[i] = this.data[child];
          i = child;
        }
        this.data[i] = last;
      }
      return first;
    }
  };
  function routeOrthogonal(snapshot, options) {
    const elements = snapshot.elements || [], index = new Map(elements.map((e) => [e.id, e])), connection = index.get(options.elementId), source = index.get(connection?.sourceId), target = index.get(connection?.targetId);
    if (!connection || !rect2(source) || !rect2(target)) throw fail("ROUTE_GEOMETRY_MISSING", "La conexi\xF3n necesita extremos y l\xEDmites completos en la hoja activa.");
    if (source.id === target.id) throw fail("ROUTE_SELF_LOOP", "Conserva el recorrido manual de un bucle que vuelve a la misma figura.");
    const saved = connection.routing || {}, sourceSide = options.sourceSide ?? (anchorPolicy(saved, "source") === "auto" ? "auto" : saved.source?.side) ?? "auto", targetSide = options.targetSide ?? (anchorPolicy(saved, "target") === "auto" ? "auto" : saved.target?.side) ?? "auto";
    if (![...SIDES, "auto"].includes(sourceSide) || ![...SIDES, "auto"].includes(targetSide)) throw fail("INVALID_ANCHOR", "Selecciona arriba, derecha, abajo, izquierda o autom\xE1tico.");
    const sourceOffset = options.sourceOffset ?? saved.source?.offset ?? 0.5, targetOffset = options.targetOffset ?? saved.target?.offset ?? 0.5, clearance = options.clearance ?? 10;
    if (!Number.isFinite(clearance) || clearance < 2 || clearance > 40) throw fail("INVALID_ROUTE", "La separaci\xF3n debe estar entre 2 y 40.");
    const area = { x: Math.min(source.x, target.x) - 100, y: Math.min(source.y, target.y) - 100, width: Math.max(source.x + source.width, target.x + target.width) - Math.min(source.x, target.x) + 200, height: Math.max(source.y + source.height, target.y + target.height) - Math.min(source.y, target.y) + 200 };
    const laneClearance = Math.max(LANE_BORDER_CLEARANCE, clearance), borders = laneBoundaries(snapshot).filter((b) => b.axis === "y" ? b.value >= area.y - laneClearance && b.value <= area.y + area.height + laneClearance && b.from <= area.x + area.width && b.to >= area.x : b.value >= area.x - laneClearance && b.value <= area.x + area.width + laneClearance && b.from <= area.y + area.height && b.to >= area.y);
    const scope = index.get(connection.flowScopeId), insideScope = scope?.type === "bpmn:SubProcess" && scope.id !== source.id && scope.id !== target.id;
    const inBounds = (p) => !insideScope || p.x >= scope.x + 4 && p.x <= scope.x + scope.width - 4 && p.y >= scope.y + 28 && p.y <= scope.y + scope.height - 4;
    const ancestors = /* @__PURE__ */ new Set();
    for (const node of [source, target]) for (let p = index.get(node.parentId); p && !ancestors.has(p.id); p = index.get(p.parentId)) ancestors.add(p.id);
    const obstacles = [];
    for (const e of elements) {
      if (rect2(e) && !e.waypoints && !["bpmn:Participant", "bpmn:Lane", "bpmn:Group", "bpmn:Process", "bpmn:Collaboration"].includes(e.type) && !ancestors.has(e.id)) {
        const own = [source.id, target.id].includes(e.id), padding = own ? 0 : clearance;
        const box = { x: e.x - padding, y: e.y - padding, width: e.width + padding * 2, height: e.height + padding * 2, id: e.id, own };
        if (boxesOverlap(box, area)) obstacles.push(box);
      }
      if (e.id !== connection.id && e.labelBounds && rect2(e.labelBounds) && !["bpmn:Group", "bpmn:Lane", "bpmn:Participant"].includes(e.type)) {
        const b = e.labelBounds, box = { x: b.x - 3, y: b.y - 3, width: b.width + 6, height: b.height + 6, id: e.id + ":label" };
        if (boxesOverlap(box, area)) obstacles.push(box);
      }
    }
    const others = elements.filter((e) => e.id !== connection.id && e.waypoints?.length > 1);
    const segmentCost = (a, b) => {
      if (!axis(a, b) || !inBounds(a) || !inBounds(b) || obstacles.some((box) => lineHitsBox(a, b, box) || box.own && segmentAlongBox(a, b, box)) || borders.some((border) => segmentNearLaneBorder(a, b, border, laneClearance))) return Infinity;
      let penalty = 0;
      for (const other of others) {
        let crossing = false, overlap = false;
        for (const [c, d] of segments(other)) {
          const contact = segmentContact(a, b, c, d);
          if (!contact) continue;
          const shared = [connection.sourceId, connection.targetId].some((id) => [other.sourceId, other.targetId].includes(id));
          if (contact.type === "contact" && shared && [other.waypoints[0], other.waypoints.at(-1)].some((p) => pointEqual(p, contact.point)) && [a, b].some((p) => pointEqual(p, contact.point))) continue;
          if (contact.type === "overlap") overlap = true;
          else crossing = true;
        }
        if (overlap) penalty += 900;
        else if (crossing) penalty += 160;
      }
      return distance(a, b) + penalty;
    };
    const normal = (a, b, side) => {
      const v = vectors[side];
      return axis(a, b) && (b.x - a.x) * v[0] + (b.y - a.y) * v[1] > 0;
    };
    let best = null;
    const pairs = [];
    for (const ss of sourceSide === "auto" ? SIDES : [sourceSide]) for (const ts of targetSide === "auto" ? SIDES : [targetSide]) {
      const a = anchorPoint(source, ss, sourceOffset), b = anchorPoint(target, ts, targetOffset), va = vectors[ss], vb = vectors[ts], as = { x: a.x + va[0] * clearance, y: a.y + va[1] * clearance }, bs = { x: b.x + vb[0] * clearance, y: b.y + vb[1] * clearance };
      pairs.push({ a, b, as, bs, ss, ts });
    }
    function consider(raw, pair) {
      const points = simplifyOrthogonal(raw);
      if (points.length < 2 || routeMetrics(points).reversals || !normal(points[0], points[1], pair.ss) || !normal(points.at(-1), points.at(-2), pair.ts)) return;
      if (points.slice(1, -1).some((p) => borders.some((b) => pointNearLaneBorder(p, b, laneClearance)))) return;
      let score = 0;
      for (let i = 1; i < points.length; i++) {
        const cost = segmentCost(points[i - 1], points[i]);
        if (!Number.isFinite(cost)) return;
        score += cost + Math.max(0, 8 - distance(points[i - 1], points[i])) * 8;
      }
      score += (points.length - 2) * 22;
      if (!best || score < best.score - 0.01 || same(score, best.score) && points.length < best.points.length) best = { points, score, pair };
    }
    for (const p of pairs) {
      consider([p.a, p.b], p);
      consider([p.a, { x: p.b.x, y: p.a.y }, p.b], p);
      consider([p.a, { x: p.a.x, y: p.b.y }, p.b], p);
      consider([p.a, p.as, { x: p.as.x, y: p.bs.y }, p.bs, p.b], p);
      consider([p.a, p.as, { x: p.bs.x, y: p.as.y }, p.bs, p.b], p);
    }
    const perfect = best && best.score <= distance(best.pair.a, best.pair.b) + 22 + 0.01;
    if (!perfect && obstacles.length <= 90) {
      const rails = (axis2) => borders.flatMap((b) => b.axis === axis2 ? [b.value - laneClearance, b.value + laneClearance] : [b.from - laneClearance, b.to + laneClearance]).filter((v) => v >= area[axis2] && v <= area[axis2] + (axis2 === "x" ? area.width : area.height));
      const xs = [.../* @__PURE__ */ new Set([...pairs.flatMap((p) => [p.a.x, p.b.x, p.as.x, p.bs.x]), ...obstacles.flatMap((b) => [b.x - (b.own ? clearance : 0), b.x + b.width + (b.own ? clearance : 0)]), ...rails("x"), area.x, area.x + area.width])].sort((a, b) => a - b);
      const ys = [.../* @__PURE__ */ new Set([...pairs.flatMap((p) => [p.a.y, p.b.y, p.as.y, p.bs.y]), ...obstacles.flatMap((b) => [b.y - (b.own ? clearance : 0), b.y + b.height + (b.own ? clearance : 0)]), ...rails("y"), area.y, area.y + area.height])].sort((a, b) => a - b);
      if (xs.length * ys.length <= 18e3) {
        const point = (i) => ({ x: xs[i % xs.length], y: ys[Math.floor(i / xs.length)] }), edgeCache = /* @__PURE__ */ new Map();
        const cost = (i, j) => {
          const key = i < j ? i + ":" + j : j + ":" + i;
          if (!edgeCache.has(key)) edgeCache.set(key, segmentCost(point(i), point(j)));
          return edgeCache.get(key);
        };
        for (const pair of pairs) {
          const start = ys.indexOf(pair.a.y) * xs.length + xs.indexOf(pair.a.x), end = ys.indexOf(pair.b.y) * xs.length + xs.indexOf(pair.b.x), heap = new Heap(), dist = /* @__PURE__ */ new Map(), previous = /* @__PURE__ */ new Map();
          heap.push({ node: start, dir: 0, cost: 0, score: distance(pair.a, pair.b) });
          dist.set(start * 5, 0);
          let found;
          while (heap.data.length) {
            const current = heap.pop(), key = current.node * 5 + current.dir;
            if (current.cost !== dist.get(key)) continue;
            if (best && current.score >= best.score) break;
            if (current.node === end) {
              found = key;
              break;
            }
            const x = current.node % xs.length, y = Math.floor(current.node / xs.length), a = point(current.node);
            for (const next of [x > 0 ? current.node - 1 : -1, x + 1 < xs.length ? current.node + 1 : -1, y > 0 ? current.node - xs.length : -1, y + 1 < ys.length ? current.node + xs.length : -1]) {
              if (next < 0) continue;
              const b = point(next), dir = same(a.y, b.y) ? b.x > a.x ? 1 : 2 : b.y > a.y ? 3 : 4;
              if (current.dir && dir !== current.dir && Math.ceil(dir / 2) === Math.ceil(current.dir / 2) || !current.dir && !normal(a, b, pair.ss) || next === end && !normal(b, a, pair.ts)) continue;
              if (current.dir && current.dir !== dir && borders.some((border) => pointNearLaneBorder(a, border, laneClearance))) continue;
              const edge = cost(current.node, next);
              if (!Number.isFinite(edge)) continue;
              const value = current.cost + edge + (current.dir && current.dir !== dir ? 22 : 0), nextKey = next * 5 + dir;
              if (value >= (dist.get(nextKey) ?? Infinity)) continue;
              dist.set(nextKey, value);
              previous.set(nextKey, key);
              heap.push({ node: next, dir, cost: value, score: value + distance(b, pair.b) });
            }
          }
          if (found !== void 0) {
            const points = [];
            for (let key = found; key !== void 0; key = previous.get(key)) points.push(point(Math.floor(key / 5)));
            consider(points.reverse(), pair);
          }
        }
      }
    }
    if (!best) throw fail("ROUTE_BLOCKED", "No se encontr\xF3 un recorrido ortogonal local libre. Conserva el recorrido y revisa el espacio o los lados elegidos.");
    const metrics = routeMetrics(best.points), minimum = distance(best.pair.a, best.pair.b), warnings = [];
    if (metrics.length > minimum * 2.5 && metrics.length - minimum > 200) warnings.push("ROUTE_DETOUR");
    if (metrics.shortLegs) warnings.push("ROUTE_SHORT_LEG");
    return { waypoints: best.points, routing: { mode: "orthogonal", manual: false, anchorPolicy: { source: sourceSide === "auto" ? "auto" : "fixed", target: targetSide === "auto" ? "auto" : "fixed" }, source: { side: best.pair.ss, offset: sourceOffset }, target: { side: best.pair.ts, offset: targetOffset } }, metrics, warnings };
  }

  // plugins/naraflows/shared/quality.mjs
  var activity = (e) => /Task$/.test(e.type) || e.type === "bpmn:CallActivity" || e.type === "bpmn:SubProcess" && e.expanded !== true;
  function reviewVisualQuality(snapshot, { elementIds, maxIssues = 200 } = {}) {
    const elements = snapshot.elements || [], index = new Map(elements.map((e) => [e.id, e])), scope = elementIds ? new Set(elementIds) : null, issues = [];
    let total = 0;
    const borders = laneBoundaries(snapshot);
    if (scope) {
      for (const e of elements) if (e.waypoints && (scope.has(e.sourceId) || scope.has(e.targetId))) scope.add(e.id);
    }
    if (scope) {
      for (const e of elements) if (e.waypoints?.length > 1 && !scope.has(e.id) && laneRouteConflicts(e.waypoints, borders.filter((b) => b.laneIds.some((id) => scope.has(id)))).length) scope.add(e.id);
    }
    const add = (code, ids, message, details = {}) => {
      if (scope && !ids.some((id) => scope.has(id))) return;
      total++;
      if (issues.length < maxIssues) issues.push({ code, severity: "warning", elementIds: ids, message, ...details });
    };
    const affected = (e) => !scope || scope.has(e.id), missingText = [];
    for (const e of elements) {
      if (e.type === "bpmn:Lane") {
        let parent2 = index.get(e.parentId);
        const seen2 = /* @__PURE__ */ new Set();
        while (parent2 && !seen2.has(parent2.id)) {
          seen2.add(parent2.id);
          if (parent2.type === "bpmn:Participant") {
            if (e.x < parent2.x || e.y < parent2.y || e.x + e.width > parent2.x + parent2.width + 0.1 || e.y + e.height > parent2.y + parent2.height + 0.1) add("LANE_OUTSIDE_PARTICIPANT", [e.id, parent2.id], "El carril se extiende fuera del participante; el ancho renderizado sigue siendo mayor.");
            break;
          }
          parent2 = index.get(parent2.parentId);
        }
      }
      if (e.waypoints?.length > 1 && affected(e)) {
        const metrics = routeMetrics(e.waypoints), simple = simplifyOrthogonal(e.waypoints), first = e.waypoints[0], last = e.waypoints.at(-1), minimum = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
        if (!metrics.orthogonal) add("ROUTE_DIAGONAL", [e.id], "La conexi\xF3n contiene un tramo diagonal.");
        if (simple.length < e.waypoints.length) add("ROUTE_REDUNDANT_POINTS", [e.id], "El recorrido conserva puntos colineales o repetidos que se pueden eliminar.");
        if (metrics.reversals) add("ROUTE_REVERSAL", [e.id], "La conexi\xF3n avanza y retrocede inmediatamente sobre el mismo tramo.", { metrics });
        for (const conflict of laneRouteConflicts(e.waypoints, borders)) {
          const operation = { type: "route_orthogonal", elementId: e.id };
          for (const end of ["source", "target"]) {
            operation[end + "Side"] = anchorPolicy(e.routing, end) === "auto" ? "auto" : e.routing?.[end]?.side || "auto";
            if (e.routing?.[end]?.offset !== void 0) operation[end + "Offset"] = e.routing[end].offset;
          }
          add("ROUTE_LANE_BORDER_CLEARANCE", [e.id, ...conflict.laneIds], "Un tramo paralelo o un codo est\xE1 demasiado cerca del separador entre carriles. Reserva un corredor interior; el cruce perpendicular est\xE1 permitido.", { ...conflict, preservesManualRoute: true, suggestedOperation: operation });
        }
        if (metrics.shortLegs && metrics.bends) add("ROUTE_SHORT_LEG", [e.id], "La conexi\xF3n tiene un tramo corto junto a un quiebre.", { metrics });
        if (metrics.length > minimum * 2.5 && metrics.length - minimum > 200) add("ROUTE_DETOUR", [e.id], "La conexi\xF3n hace un rodeo largo; evitar cruces no basta para considerarla una buena ruta.", { metrics, minimum });
        for (const shape of [index.get(e.sourceId), index.get(e.targetId)].filter(Boolean)) {
          if (segments(e).some(([a, b]) => lineHitsBox(a, b, shape))) add("ROUTE_THROUGH_ENDPOINT", [e.id, shape.id], "El recorrido atraviesa una de sus propias figuras.");
          if (segments(e).some(([a, b]) => segmentAlongBox(a, b, shape))) add("ROUTE_ON_FIGURE_BORDER", [e.id, shape.id], "El recorrido circula sobre el borde de una figura en lugar de separarse de ella.");
        }
        const source = index.get(e.sourceId), target = index.get(e.targetId);
        if (source && target && source !== target && !e.routing?.sharedWith) {
          const gap = Math.max(0, source.x - target.x - target.width, target.x - source.x - source.width) + Math.max(0, source.y - target.y - target.height, target.y - source.y - source.height);
          if (metrics.length > gap + 80 && metrics.bends > 1) try {
            const alternative = routeOrthogonal(snapshot, { elementId: e.id, sourceSide: "auto", targetSide: "auto", sourceOffset: 0.5, targetOffset: 0.5 });
            if (metrics.length > alternative.metrics.length * 1.6 && metrics.length - alternative.metrics.length > 80) add("ROUTE_AVOIDABLE_DETOUR", [e.id], "Existe un recorrido local m\xE1s corto con lados autom\xE1ticos. Revisa la intenci\xF3n y usa Recalcular solo esta conexi\xF3n si corresponde.", { metrics, alternative: alternative.metrics, preservesManualRoute: true, suggestedOperation: { type: "route_orthogonal", elementId: e.id, sourceSide: "auto", targetSide: "auto", sourceOffset: 0.5, targetOffset: 0.5 } });
          } catch (error) {
            if (!["ROUTE_BLOCKED", "ROUTE_GEOMETRY_MISSING", "ROUTE_SELF_LOOP"].includes(error.code)) throw error;
          }
        }
        for (const [end, point] of [["source", first], ["target", last]]) {
          const anchor = e.routing?.[end], shape = index.get(e[end + "Id"]);
          if (anchor && shape) {
            try {
              const expected = anchorPoint(shape, anchor.side, anchor.offset);
              if (Math.hypot(point.x - expected.x, point.y - expected.y) > 2) add("ROUTE_ANCHOR_CHANGED", [e.id, shape.id], "El extremo ya no coincide con el lado de anclaje elegido.", { end, expected, actual: point });
            } catch {
              add("ROUTE_ANCHOR_INVALID", [e.id], "El anclaje guardado no tiene un lado y una posici\xF3n v\xE1lidos.", { end });
            }
          }
        }
      }
      if (!e.name?.trim() || !activity(e) || !affected(e)) continue;
      const text = e.textLayout;
      if (!text?.rendered) {
        missingText.push(e.id);
        continue;
      }
      if (!text.fits || text.contentPreserved === false) add("TEXT_OUTSIDE_ACTIVITY", [e.id], "El texto no cabe completo en el espacio reservado de la actividad.", { fontSize: text.fontSize, bounds: text.bounds, available: text.available });
      for (const marker of text.markerBounds || []) if (text.bounds && boxesOverlap(text.bounds, marker)) add("TEXT_OVER_MARKER", [e.id], "El texto se superpone al icono o marcador de la actividad.");
      let parent = index.get(e.parentId);
      const seen = /* @__PURE__ */ new Set();
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        if (parent.type === "bpmn:Lane" && text.bounds) {
          const b = text.bounds;
          if (b.x < parent.x || b.x + b.width > parent.x + parent.width || b.y < parent.y || b.y + b.height > parent.y + parent.height) add("TEXT_OVER_LANE_BORDER", [e.id, parent.id], "El texto de la actividad invade el borde del carril.");
          break;
        }
        parent = index.get(parent.parentId);
      }
    }
    const activities = elements.filter((e) => activity(e) && e.name?.trim() && affected(e)), sizes = /* @__PURE__ */ new Map();
    for (const e of activities) {
      const size = e.textLayout?.fontSize ?? e.visualStyle?.fontSize ?? 16;
      const ids = sizes.get(size) || [];
      ids.push(e.id);
      sizes.set(size, ids);
    }
    if (sizes.size > 1) add("ACTIVITY_FONT_INCONSISTENT", activities.map((e) => e.id), "Las actividades del conjunto revisado usan tama\xF1os de letra distintos.", { fontSizes: [...sizes.keys()] });
    for (const e of elements.filter((e2) => affected(e2) && e2.textLayout?.rendered && e2.textLayout.bounds && !activity(e2))) {
      const bounds = e.textLayout.bounds;
      for (const f of elements.filter((f2) => f2.id !== e.id && f2.waypoints?.length > 1)) if (segments(f).some(([a, b]) => lineHitsBox(a, b, bounds))) add("RENDERED_TEXT_OVER_LINE", [e.id, f.id], "El texto renderizado se superpone a una l\xEDnea.");
    }
    return { ok: total === 0, complete: missingText.length === 0 && !snapshot.elementsTruncated && !snapshot.elementsFiltered && total <= maxIssues, scope: scope ? "affected-elements" : "active-sheet", elementIds: scope ? [...scope] : void 0, issues, totalIssues: total, coverage: { missingRenderedText: missingText }, businessApproval: false };
  }

  // plugins/naraflows/shared/connection-editing.mjs
  var fail2 = (code, message) => Object.assign(Error(message), { code });
  function projectRoute(points, point) {
    let best;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)), p = { x: a.x + dx * t, y: a.y + dy * t }, distance2 = Math.hypot(p.x - point.x, p.y - point.y);
      if (!best || distance2 < best.distance) best = { point: p, index: i - 1, distance: distance2 };
    }
    return best;
  }
  function planReconnectPreview(snapshot, elementId, { sourceId, targetId, sourcePoint, targetPoint, routing } = {}) {
    const index = new Map(snapshot.elements.map((e) => [e.id, e])), connection = index.get(elementId), source = index.get(sourceId || connection?.sourceId), target = index.get(targetId || connection?.targetId);
    if (!connection || !source || !target) throw fail2("ROUTE_GEOMETRY_MISSING", "Faltan los extremos de la conexi\xF3n.");
    const old = routing || connection.routing || {}, a = sourcePoint ? inferAnchor(source, sourcePoint) : old.source || inferAnchor(source, connection.waypoints[0]), b = targetPoint ? inferAnchor(target, targetPoint) : old.target || inferAnchor(target, connection.waypoints.at(-1));
    const virtual = { ...connection, sourceId: source.id, targetId: target.id, routing: { ...old, mode: "orthogonal", source: a, target: b, anchorPolicy: { ...old.anchorPolicy, ...sourcePoint ? { source: "fixed" } : {}, ...targetPoint ? { target: "fixed" } : {} } } };
    if (old.manual && connection.waypoints.length > 2) {
      const repair = (points2, shape, anchor) => {
        const first = anchorPoint(shape, anchor.side, anchor.offset), v = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[anchor.side], next = points2[1];
        points2[0] = first;
        if ((next.x - first.x) * v[0] + (next.y - first.y) * v[1] > 1) {
          if (v[0]) next.y = first.y;
          else next.x = first.x;
        } else {
          const stub = { x: first.x + v[0] * 12, y: first.y + v[1] * 12 };
          points2.splice(1, 0, stub, v[0] ? { x: stub.x, y: next.y } : { x: next.x, y: stub.y });
        }
        return points2;
      };
      let points = connection.waypoints.map((p) => ({ ...p }));
      points = repair(points, source, a);
      points = repair(points.reverse(), target, b).reverse();
      points = orthogonalizeWaypoints(points, { sourceSide: a.side, targetSide: b.side });
      return { waypoints: points, routing: { ...virtual.routing, manual: true } };
    }
    const plan = routeOrthogonal({ ...snapshot, elements: snapshot.elements.map((e) => e.id === elementId ? virtual : e) }, { elementId });
    if (old.manual) plan.routing.manual = true;
    return plan;
  }
  function planMovedRoutes(snapshot, { elementIds, delta = { x: 0, y: 0 } }) {
    const moved = new Set(elementIds), shift = (p) => ({ ...p, x: p.x + delta.x, y: p.y + delta.y });
    const elements = snapshot.elements.map((e) => {
      const both = e.waypoints && moved.has(e.sourceId) && moved.has(e.targetId);
      return { ...e, ...moved.has(e.id) && !e.waypoints ? shift(e) : {}, ...e.labelBounds && (moved.has(e.id) || moved.has(e.id + "_label")) ? { labelBounds: shift(e.labelBounds) } : {}, ...both ? { waypoints: e.waypoints.map(shift) } : {} };
    });
    const data = { ...snapshot, elements }, affectedIds = new Set(elements.filter((e) => e.waypoints?.length > 1 && (moved.has(e.sourceId) || moved.has(e.targetId))).map((e) => e.id)), plans = [];
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const e of elements) if (e.routing?.sharedWith && affectedIds.has(e.routing.sharedWith) && !affectedIds.has(e.id)) {
        affectedIds.add(e.id);
        expanded = true;
      }
    }
    const affected = elements.filter((e) => affectedIds.has(e.id)).sort((a, b) => a.id.localeCompare(b.id));
    for (const e of affected) if (e.routing?.manual === false && !e.routing.sharedWith) e.waypoints = [];
    for (const e of affected.filter((e2) => e2.routing?.manual !== false || e2.routing.sharedWith)) {
      if (!e.routing) continue;
      try {
        const plan = planReconnectPreview(data, e.id, { routing: { ...e.routing, manual: true } });
        Object.assign(e, plan);
        plans.push({ elementId: e.id, ...plan });
      } catch (error) {
        if (!["ROUTE_BLOCKED", "ROUTE_SELF_LOOP"].includes(error.code)) throw error;
      }
    }
    for (const e of affected.filter((e2) => e2.routing?.manual === false && !e2.routing.sharedWith)) {
      try {
        const plan = routeOrthogonal(data, { elementId: e.id });
        Object.assign(e, plan);
        plans.push({ elementId: e.id, ...plan });
      } catch (error) {
        if (!["ROUTE_BLOCKED", "ROUTE_SELF_LOOP"].includes(error.code)) throw error;
      }
    }
    const resolved = /* @__PURE__ */ new Set(), resolve = (e) => {
      if (resolved.has(e.id)) return;
      resolved.add(e.id);
      const r = e.routing, reference = elements.find((f) => f.id === r?.sharedWith);
      if (!reference) return;
      if (affectedIds.has(reference.id)) resolve(reference);
      const both = moved.has(reference.sourceId) && moved.has(reference.targetId), point = both ? shift(r.joinPoint) : r.joinPoint;
      try {
        const plan = shareConnectionPath(data, { elementId: e.id, withConnectionId: reference.id, point, end: r.sharedEnd });
        Object.assign(e, plan);
        const slot = plans.findIndex((p) => p.elementId === e.id);
        if (slot >= 0) plans.splice(slot, 1);
        plans.push({ elementId: e.id, ...plan });
      } catch (error) {
        if (!["ROUTE_BLOCKED", "SHARED_ROUTE_DIAGONAL", "SHARED_ROUTE_EMPTY", "SHARED_ROUTE_CYCLE"].includes(error.code)) throw error;
      }
    };
    for (const e of affected.filter((e2) => e2.routing?.sharedWith)) resolve(e);
    return plans;
  }
  function shareConnectionTail(snapshot, { elementId, withConnectionId, point, sourceSide, sourceOffset } = {}) {
    const index = new Map(snapshot.elements.map((e) => [e.id, e])), connection = index.get(elementId), reference = index.get(withConnectionId), source = index.get(connection?.sourceId), target = index.get(reference?.targetId);
    if (!connection || !reference || connection === reference || !source || !target || connection.targetId !== reference.targetId) throw fail2("SHARED_TARGET_REQUIRED", "Las conexiones deben conservar el mismo destino para compartir un tramo.");
    if (!routeMetrics(reference.waypoints).orthogonal) throw fail2("SHARED_ROUTE_DIAGONAL", "El recorrido de referencia debe ser ortogonal.");
    const join = projectRoute(reference.waypoints, point);
    if (!join) throw fail2("SHARED_ROUTE_EMPTY", "Selecciona un tramo de la conexi\xF3n.");
    const a = reference.waypoints[join.index], b = reference.waypoints[join.index + 1], horizontal = same(a.y, b.y), positive = horizontal ? b.x > a.x : b.y > a.y, p = join.point, center = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const side = horizontal && Math.abs(center.y - p.y) > 8 ? center.y < p.y ? "top" : "bottom" : !horizontal && Math.abs(center.x - p.x) > 8 ? center.x < p.x ? "left" : "right" : horizontal ? positive ? "left" : "right" : positive ? "top" : "bottom";
    const portal = { id: "__nara_route_portal", type: "bpmn:Task", parentId: target.parentId, x: p.x - (side === "left" ? 0 : side === "right" ? 2 : 1), y: p.y - (side === "top" ? 0 : side === "bottom" ? 2 : 1), width: 2, height: 2 };
    const head = { ...connection, targetId: portal.id, routing: void 0 }, nearTarget = p.x >= target.x - 12 && p.x <= target.x + target.width + 12 && p.y >= target.y - 12 && p.y <= target.y + target.height + 12;
    const elements = snapshot.elements.filter((e) => (e.id === elementId || e.id !== reference.id && e.routing?.sharedWith !== reference.id) && (!nearTarget || e.id !== target.id)).map((e) => e.id === elementId ? head : e);
    elements.push(portal);
    const sourceAnchor = connection.routing?.manual ? connection.routing.source : null, result = routeOrthogonal({ ...snapshot, elements }, { elementId, sourceSide: sourceSide || sourceAnchor?.side || "auto", sourceOffset: sourceOffset ?? sourceAnchor?.offset ?? 0.5, targetSide: side, targetOffset: 0.5 });
    const waypoints = simplifyOrthogonal([...result.waypoints, ...reference.waypoints.slice(join.index + 1)]);
    return { waypoints, routing: { mode: "orthogonal", manual: true, source: result.routing.source, target: inferAnchor(target, waypoints.at(-1)), sharedWith: reference.id, sharedEnd: "target", joinPoint: p } };
  }
  function shareConnectionPath(snapshot, options) {
    const index = new Map(snapshot.elements.map((e) => [e.id, e]));
    const seen = /* @__PURE__ */ new Set([options.elementId]);
    for (let e = index.get(options.withConnectionId); e; e = index.get(e.routing?.sharedWith)) {
      if (seen.has(e.id)) throw fail2("SHARED_ROUTE_CYCLE", "Elige una conexi\xF3n que no dependa de este mismo tramo.");
      seen.add(e.id);
    }
    if (options.end !== "source") return shareConnectionTail(snapshot, options);
    const reversed = { ...snapshot, elements: snapshot.elements.map((e) => e.waypoints ? { ...e, sourceId: e.targetId, targetId: e.sourceId, waypoints: e.waypoints.slice().reverse(), routing: e.routing ? { ...e.routing, source: e.routing.target, target: e.routing.source } : void 0 } : e) };
    const result = shareConnectionTail(reversed, { ...options, sourceSide: options.targetSide, sourceOffset: options.targetOffset });
    return { waypoints: result.waypoints.reverse(), routing: { ...result.routing, source: result.routing.target, target: result.routing.source, sharedEnd: "source" } };
  }
  function intentionalSharedContact(a, b, p, q, r, s, hit) {
    const ar = a.routing || {}, br = b.routing || {};
    if (!(a.targetId && a.targetId === b.targetId || a.sourceId && a.sourceId === b.sourceId && (ar.sharedEnd === "source" || br.sharedEnd === "source"))) return false;
    if (!(ar.sharedWith === b.id || br.sharedWith === a.id || ar.sharedWith && ar.sharedWith === br.sharedWith)) return false;
    const directed = (q.x - p.x) * (s.x - r.x) + (q.y - p.y) * (s.y - r.y) > 0;
    if (hit.type === "overlap") return directed;
    if (hit.type !== "contact" || !hit.point) return false;
    if ([ar.joinPoint, br.joinPoint].some((p2) => p2 && pointEqual(p2, hit.point))) return true;
    return segments(a).some(([u, v]) => segments(b).some(([w, z]) => {
      const shared = segmentContact(u, v, w, z);
      return shared?.type === "overlap" && (v.x - u.x) * (z.x - w.x) + (v.y - u.y) * (z.y - w.y) > 0 && projectRoute([u, v], hit.point)?.distance < 0.01 && projectRoute([w, z], hit.point)?.distance < 0.01;
    }));
  }

  // plugins/naraflows/shared/layout.mjs
  function planContainerFit(snapshot, elementId, { padding = 40 } = {}) {
    const elements = snapshot.elements || [], index = new Map(elements.map((e) => [e.id, e])), container = index.get(elementId);
    const fail3 = (message) => {
      throw Object.assign(Error(message), { code: "CONTAINER_FIT_UNSUPPORTED" });
    };
    if (container?.type !== "bpmn:Participant" || !Number.isFinite(padding) || padding < 10 || padding > 200) fail3("Selecciona un participante expandido y un margen de 10 a 200.");
    const descendant = (e) => {
      const seen = /* @__PURE__ */ new Set();
      for (let p = index.get(e.parentId); p && !seen.has(p.id); p = index.get(p.parentId)) {
        if (p.id === elementId) return true;
        seen.add(p.id);
      }
      return false;
    };
    const within = (e) => e.x >= container.x && e.y >= container.y && e.x + e.width <= container.x + container.width && e.y + e.height <= container.y + container.height;
    const children = elements.filter((e) => e.id !== elementId && !e.waypoints && (descendant(e) || e.type === "bpmn:Group" && within(e)) && e.type !== "bpmn:Lane");
    if (!children.length) fail3("No hay figuras dentro del participante para calcular su tama\xF1o.");
    const ids = new Set(children.map((e) => e.id)), bounds = children.flatMap((e) => [{ x: e.x, y: e.y, width: e.width, height: e.height }, ...e.textLayout?.bounds ? [e.textLayout.bounds] : e.labelBounds ? [e.labelBounds] : []]);
    for (const e of elements) if (e.waypoints && ids.has(e.sourceId) && ids.has(e.targetId)) bounds.push(...e.waypoints.map((p) => ({ ...p, width: 0, height: 0 })), ...e.labelBounds ? [e.labelBounds] : []);
    const right = Math.max(...bounds.map((b) => b.x + b.width)), bottom = Math.max(...bounds.map((b) => b.y + b.height));
    const hasLanes = elements.some((e) => e.type === "bpmn:Lane" && descendant(e));
    return { type: "resize", elementId, x: container.x, y: container.y, width: Math.min(container.width, Math.max(300, right - container.x + padding)), height: hasLanes ? container.height : Math.min(container.height, Math.max(140, bottom - container.y + padding)), autoResize: false };
  }

  // plugins/naraflows/shared/audit.mjs
  var containers = /* @__PURE__ */ new Set(["bpmn:Participant", "bpmn:Lane", "bpmn:Group", "bpmn:TextAnnotation", "bpmn:Collaboration", "bpmn:Process"]);
  var conditional = /* @__PURE__ */ new Set(["bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ComplexGateway"]);
  function validateSnapshot(snapshot, { profile = "review", geometry = true, maxIssues = 200 } = {}) {
    if (!["review", "formal"].includes(profile)) throw Error("profile must be review or formal");
    const issues = [], seen = /* @__PURE__ */ new Set();
    let detected = 0, errors = 0, warnings = 0;
    const add = (code, severity, ids, message, extra = {}) => {
      const key = code + ":" + [...ids].sort().join(",");
      if (seen.has(key)) return;
      seen.add(key);
      detected++;
      if (severity === "error") errors++;
      else warnings++;
      if (issues.length < maxIssues) issues.push({ code, severity, elementIds: ids, message, ...extra });
    };
    const elements = snapshot.elements || [], index = new Map(elements.map((e) => [e.id, e]));
    const coverage = { geometryRequested: geometry, missingFigureBounds: [], missingRoutes: [], missingLabelBounds: [] };
    const source = Object.fromEntries(["fileName", "revision", "sha256", "activeSheetId", "editorVersion", "editorBuild"].filter((key) => snapshot[key] !== void 0).map((key) => [key, snapshot[key]]));
    if (snapshot.elementsTruncated || snapshot.elementsFiltered) add("INCOMPLETE_SNAPSHOT", "error", [], "La lectura est\xE1 truncada o filtrada; no se puede declarar validaci\xF3n completa.");
    if (snapshot.unappliedProperties) add("FORM_PENDING", "warning", snapshot.selectedIds || [], "Hay propiedades sin aplicar; esta revisi\xF3n analiza el modelo confirmado.");
    for (const warning of snapshot.warnings || []) add("IMPORT_WARNING", "warning", [], String(warning));
    if (snapshot.diagramType === "erd") {
      const model = snapshot.dataModel || {}, tables = new Map((model.tables || []).map((t) => [t.id, t]));
      for (const table of tables.values()) {
        const names = /* @__PURE__ */ new Set();
        for (const field of table.fields || []) {
          if (names.has(field.name)) add("DUPLICATE_FIELD", "error", [table.id, field.id], "Nombre de campo repetido.");
          names.add(field.name);
        }
      }
      for (const relation of model.relationships || []) for (const side of ["source", "target"]) {
        if (!tables.get(relation[side + "TableId"])?.fields.some((f) => f.id === relation[side + "FieldId"])) add("DANGLING_RELATIONSHIP", "error", [relation.id], "La relaci\xF3n tiene un extremo inexistente.");
      }
    } else {
      const groups = /* @__PURE__ */ new Map();
      for (const e of elements) {
        for (const definition of e.eventDefinitions || []) {
          if (definition.type === "bpmn:LinkEventDefinition") {
            if (!definition.name?.trim()) {
              add("LINK_NAME_MISSING", "error", [e.id], "Falta el nombre interno del enlace.");
              continue;
            }
            const key = (e.flowScopeId || e.parentId || "") + ":" + definition.name;
            const group = groups.get(key) || [];
            group.push(e);
            groups.set(key, group);
          }
          if (definition.type === "bpmn:TimerEventDefinition" && !["timeDate", "timeDuration", "timeCycle"].some((k) => definition[k]?.body?.trim())) add("TIMER_VALUE_MISSING", "error", [e.id], "Falta el valor del temporizador.");
          if (definition.type === "bpmn:ConditionalEventDefinition" && !definition.condition?.body?.trim()) add("EVENT_CONDITION_MISSING", "error", [e.id], "Falta la condici\xF3n del evento.");
        }
        if (e.type === "bpmn:SequenceFlow") {
          const source2 = index.get(e.sourceId), target = index.get(e.targetId);
          if (!source2 || !target) add("DANGLING_FLOW", "error", [e.id], "La conexi\xF3n tiene un extremo inexistente.");
          else if (source2.flowScopeId && target.flowScopeId && source2.flowScopeId !== target.flowScopeId) add("SEQUENCE_CROSSES_SCOPE", "error", [e.id, source2.id, target.id], "Un flujo de secuencia cruza procesos o subprocesos.");
          if (source2?.defaultFlowId === e.id && e.condition?.body) add("DEFAULT_HAS_CONDITION", "error", [e.id], "La salida predeterminada no debe tener condici\xF3n.");
          if (["bpmn:ParallelGateway", "bpmn:EventBasedGateway"].includes(source2?.type) && e.condition?.body) add("UNSUPPORTED_FLOW_CONDITION", "error", [e.id, source2.id], "Esta compuerta no eval\xFAa condiciones en sus salidas.");
        }
        if (conditional.has(e.type)) {
          const outgoing = elements.filter((f) => f.type === "bpmn:SequenceFlow" && f.sourceId === e.id);
          if (e.defaultFlowId && !outgoing.some((f) => f.id === e.defaultFlowId)) add("INVALID_DEFAULT_FLOW", "error", [e.id], "La salida predeterminada no pertenece a esta compuerta.");
          if (outgoing.length > 1) {
            for (const f of outgoing) if (f.id !== e.defaultFlowId && !f.condition?.body?.trim()) add("BRANCH_CONDITION_MISSING", profile === "formal" ? "error" : "warning", [e.id, f.id], "La rama tiene una etiqueta, pero no una condici\xF3n BPMN formal.");
          }
        }
      }
      for (const group of groups.values()) {
        const catches = group.filter((e) => e.type === "bpmn:IntermediateCatchEvent"), throws = group.filter((e) => e.type === "bpmn:IntermediateThrowEvent"), ids = group.map((e) => e.id);
        if (catches.length > 1) add("DUPLICATE_LINK_CATCH", "error", ids, "Hay varias entradas con igual nombre interno en el mismo \xE1mbito.");
        if (!catches.length || !throws.length) add("INCOMPLETE_LINK_PAIR", profile === "formal" ? "error" : "warning", ids, "Falta la entrada o la salida del enlace en el mismo proceso o subproceso.");
      }
    }
    if (geometry) {
      for (const e of elements) {
        const connection = /(?:Flow|Association|Relationship)$/.test(e.type) || Boolean(e.sourceId || e.targetId);
        if (connection && !(e.waypoints?.length > 1 && e.waypoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))) coverage.missingRoutes.push(e.id);
        else if (!connection && !containers.has(e.type) && !(Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0)) coverage.missingFigureBounds.push(e.id);
        const external = e.externalLabelExpected ?? (Boolean(e.name?.trim()) && /(?:Event|Gateway|Flow|Reference)$/.test(e.type));
        if (external && !(e.labelBounds && Number.isFinite(e.labelBounds.x) && Number.isFinite(e.labelBounds.y) && e.labelBounds.width > 0 && e.labelBounds.height > 0)) coverage.missingLabelBounds.push(e.id);
      }
      for (const [key, message] of [["missingFigureBounds", "Faltan l\xEDmites de figuras."], ["missingRoutes", "Faltan recorridos completos."], ["missingLabelBounds", "Faltan l\xEDmites de etiquetas externas."]]) if (coverage[key].length) add("GEOMETRY_UNAVAILABLE", "warning", coverage[key], message + " La revisi\xF3n geom\xE9trica es parcial.", { coverage: key });
      const nodes = elements.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0 && !containers.has(e.type) && !e.waypoints);
      const flows = elements.filter((e) => e.waypoints?.length > 1), labels = elements.filter((e) => e.labelBounds && !["bpmn:Group", "bpmn:Lane", "bpmn:Participant"].includes(e.type));
      const ancestors = (e) => {
        const ids = /* @__PURE__ */ new Set();
        for (let p = index.get(e.parentId); p && !ids.has(p.id); p = index.get(p.parentId)) ids.add(p.id);
        return ids;
      };
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.attachedToId !== b.id && b.attachedToId !== a.id && !ancestors(a).has(b.id) && !ancestors(b).has(a.id) && boxesOverlap(a, b)) add("FIGURE_OVERLAP", "warning", [a.id, b.id], "Las figuras se superponen.");
      }
      for (const f of flows) {
        const owners = ancestors(f);
        for (const n of nodes) {
          if (owners.has(n.id)) {
            if ((f.waypoints || []).some((p) => p.x < n.x - 0.1 || p.x > n.x + n.width + 0.1 || p.y < n.y - 0.1 || p.y > n.y + n.height + 0.1)) add("FLOW_OUTSIDE_SCOPE", "error", [f.id, n.id], "El recorrido sale de su subproceso contenedor.");
            continue;
          }
          if (![f.sourceId, f.targetId].includes(n.id) && segments(f).some(([a, b]) => lineHitsBox(a, b, n))) add("FLOW_THROUGH_FIGURE", "error", [f.id, n.id], "La l\xEDnea atraviesa una figura ajena.");
        }
      }
      for (let i = 0; i < flows.length; i++) for (let j = i + 1; j < flows.length; j++) {
        const a = flows[i], b = flows[j];
        for (const [p, q] of segments(a)) for (const [r, s] of segments(b)) {
          const hit = segmentContact(p, q, r, s);
          if (!hit) continue;
          if (intentionalSharedContact(a, b, p, q, r, s, hit)) continue;
          const shared = [a.sourceId, a.targetId].some((id) => id && [b.sourceId, b.targetId].includes(id));
          const endpoint = (f) => hit.point && [f.waypoints[0], f.waypoints.at(-1)].some((p2) => pointEqual(p2, hit.point));
          if (hit.type === "contact" && shared && endpoint(a) && endpoint(b)) continue;
          add(hit.type === "overlap" ? "LINE_OVERLAP" : hit.type === "crossing" ? "LINE_CROSSING" : "UNINTENDED_CONTACT", "warning", [a.id, b.id], "Las conexiones se superponen, cruzan o se tocan fuera de un extremo compartido.", hit.point ? { point: hit.point } : {});
        }
      }
      for (let i = 0; i < labels.length; i++) {
        const e = labels[i], bounds = e.labelBounds;
        for (const f of flows) if (segments(f).some(([a, b]) => lineHitsBox(a, b, bounds))) add("LABEL_OVER_LINE", "warning", [e.id, f.id], "Una etiqueta se superpone a una l\xEDnea.");
        for (const n of nodes) if (n.id !== e.id && boxesOverlap(bounds, n)) add("LABEL_OVER_FIGURE", "warning", [e.id, n.id], "Una etiqueta se superpone a una figura.");
        for (const other of labels.slice(i + 1)) if (boxesOverlap(bounds, other.labelBounds)) add("LABEL_OVERLAP", "warning", [e.id, other.id], "Dos etiquetas se superponen.");
      }
    }
    return { source, coverage, profile, valid: errors === 0, complete: !snapshot.elementsTruncated && !snapshot.elementsFiltered && detected <= maxIssues && !Object.values(coverage).some((value) => Array.isArray(value) && value.length), issues, totalIssues: detected, errors, warnings, quality: geometry ? reviewVisualQuality(snapshot, { maxIssues }) : void 0, scope: "active-sheet", businessApproval: false };
  }
  function compareSnapshots(before, after) {
    const previous = new Map((before.elements || []).map((e) => [e.id, e])), current = new Map((after.elements || []).map((e) => [e.id, e]));
    const fields = ["type", "name", "documentation", "parentId", "flowScopeId", "sourceId", "targetId", "x", "y", "width", "height", "waypoints", "labelBounds", "semanticProperties", "defaultFlowId", "condition", "eventDefinitions", "visualStyle", "routing"];
    return { added: [...current.keys()].filter((id) => !previous.has(id)), removed: [...previous.keys()].filter((id) => !current.has(id)), changed: [...previous].filter(([id]) => current.has(id)).map(([id, a]) => ({ id, fields: fields.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(current.get(id)[key])) })).filter((e) => e.fields.length) };
  }
  function planOperations(snapshot, operations) {
    const state = new Map((snapshot.elements || []).map((e) => [e.id, structuredClone(e)])), result = [], skipped = [];
    for (const [i, operation] of operations.entries()) {
      const e = state.get(operation.elementId), op = structuredClone(operation);
      let noOp = false;
      if (e) {
        if (op.type === "label") {
          noOp = e.name === op.text && (!op.bounds || JSON.stringify(e.labelBounds) === JSON.stringify(op.bounds));
          e.name = op.text;
          if (op.bounds) e.labelBounds = op.bounds;
        }
        if (op.type === "documentation") {
          noOp = e.documentation === op.text;
          e.documentation = op.text;
        }
        if (op.type === "route") {
          noOp = JSON.stringify(e.waypoints) === JSON.stringify(op.waypoints);
          e.waypoints = op.waypoints;
        }
        if (op.type === "move" && !op.parentId) {
          noOp = op.dx === 0 && op.dy === 0;
          e.x += op.dx;
          e.y += op.dy;
        }
        if (op.type === "properties") {
          noOp = Object.entries(op.values).every(([key, value]) => e.semanticProperties?.[key] === value);
          e.semanticProperties = { ...e.semanticProperties, ...op.values };
        }
      }
      if (noOp) skipped.push(i);
      else {
        result.push(op);
        if (!["label", "documentation", "route"].includes(op.type)) state.clear();
        else if (op.type === "route" && e) delete e.labelBounds;
      }
    }
    return { sourceRevision: snapshot.revision, originalCount: operations.length, operations: result, skippedIndices: skipped, batchSizeLimit: BATCH_LIMIT };
  }
  return __toCommonJS(audit_exports);
})();
