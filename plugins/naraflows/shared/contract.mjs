export const PROTOCOL_VERSION = 5;
export const TOOL_CONTRACT = 'visual-quality-v1';
export const BATCH_LIMIT = 200;
export const BATCH_OPERATIONS = ['label','documentation','create','connect','move','resize','move_elements','route','route_orthogonal','share_connection','compact_container','fit_text','style','delete','properties','lane_split','lane_add','matrix','clear'];
export const BPMN_CREATE_TYPES = ['bpmn:Task','bpmn:ManualTask','bpmn:UserTask','bpmn:ServiceTask','bpmn:SendTask','bpmn:ReceiveTask','bpmn:ScriptTask','bpmn:BusinessRuleTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:InclusiveGateway','bpmn:ParallelGateway','bpmn:ComplexGateway','bpmn:EventBasedGateway','bpmn:TextAnnotation','bpmn:DataObjectReference','bpmn:DataStoreReference','bpmn:Participant'];
export const EVENT_KINDS = {
  'bpmn:StartEvent': ['Message','Timer','Conditional','Signal'], 'bpmn:EndEvent': ['Message','Signal','Error','Escalation','Terminate','Compensate'],
  'bpmn:IntermediateCatchEvent': ['Message','Timer','Conditional','Link','Signal'], 'bpmn:IntermediateThrowEvent': ['Message','Signal','Escalation','Link','Compensate']
};
