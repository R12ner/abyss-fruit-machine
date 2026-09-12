const requiredText=['id','title','subtitle','badge'];

function validateDefinition(definition){
  if(!definition||requiredText.some(key=>typeof definition[key]!=='string'||!definition[key].trim())||typeof definition.create!=='function')throw new TypeError('Invalid casino game definition');
}

export function createGameRegistry(){
  const entries=new Map();let activeId=null,context=null;
  return Object.freeze({
    register(definition){validateDefinition(definition);if(entries.has(definition.id))throw new Error(`Duplicate game: ${definition.id}`);entries.set(definition.id,{definition,instance:null});return definition},
    initialize(sharedContext){context=sharedContext;for(const entry of entries.values())entry.instance=entry.definition.create(sharedContext)||{}},
    list(){return [...entries.values()].map(({definition,instance})=>({...definition,instance}))},
    enter(id){const entry=entries.get(id);if(!entry)throw new Error(`Unknown game: ${id}`);if(activeId&&activeId!==id)entries.get(activeId)?.instance?.leave?.();activeId=id;entry.instance?.enter?.();return entry.instance},
    leave(){if(!activeId)return;entries.get(activeId)?.instance?.leave?.();activeId=null},
    active(){return activeId},
    context(){return context}
  });
}
