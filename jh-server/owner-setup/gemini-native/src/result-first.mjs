// Compatibility names now point to the ONLY native implementation.
// Schema 1/2 and old {web,device} port pairs are rejected; never silently replay them.
export {createGeminiNativeTask as createResultFirstTask,GeminiNativeWorkflow as ResultFirstWorkflow,validDelivery} from './native-workflow.mjs';
