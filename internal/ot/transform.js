function transform(opA, opB) {
  if (opA.type === 'insert' && opB.type === 'insert') {
    return transformInsertInsert(opA, opB);
  } else if (opA.type === 'delete' && opB.type === 'delete') {
    return transformDeleteDelete(opA, opB);
  } else if (opA.type === 'insert' && opB.type === 'delete') {
    return transformInsertDelete(opA, opB);
  } else if (opA.type === 'delete' && opB.type === 'insert') {
    const [opB_prime, opA_prime] = transformInsertDelete(opB, opA);
    return [opA_prime, opB_prime];
  }
}

function transformInsertInsert(opA, opB) {
  const opA_prime = { ...opA };
  const opB_prime = { ...opB };

  if (opA.position < opB.position) {
    opB_prime.position += opA.value.length;
  } else if (opA.position > opB.position) {
    opA_prime.position += opB.value.length;
  } else {
    // Break tie deterministically
    if (opA.value < opB.value) {
      opB_prime.position += opA.value.length;
    } else {
      opA_prime.position += opB.value.length;
    }
  }
  return [opA_prime, opB_prime];
}

function transformInsertDelete(opInsert, opDelete) {
  const opInsert_prime = { ...opInsert };
  const opDelete_prime = { ...opDelete };

  if (opInsert.position <= opDelete.position) {
    opDelete_prime.position += opInsert.value.length;
  } else if (opInsert.position > opDelete.position && opInsert.position < opDelete.position + opDelete.length) {
    opInsert_prime.position = opDelete.position;
    opInsert_prime.value = "";
    opDelete_prime.length += opInsert.value.length;
  } else {
    opInsert_prime.position -= opDelete.length;
  }

  return [opInsert_prime, opDelete_prime];
}

function transformDeleteDelete(opA, opB) {
  let aStart = opA.position;
  let aEnd = opA.position + opA.length;
  let bStart = opB.position;
  let bEnd = opB.position + opB.length;

  let opA_prime = { type: 'delete', position: 0, length: 0 };
  let opB_prime = { type: 'delete', position: 0, length: 0 };

  if (aEnd <= bStart) {
    opA_prime.position = opA.position;
    opA_prime.length = opA.length;
    opB_prime.position = opB.position - opA.length;
    opB_prime.length = opB.length;
  } else if (bEnd <= aStart) {
    opA_prime.position = opA.position - opB.length;
    opA_prime.length = opA.length;
    opB_prime.position = opB.position;
    opB_prime.length = opB.length;
  } else {
    let overlapStart = Math.max(aStart, bStart);
    let overlapEnd = Math.min(aEnd, bEnd);
    let overlapLength = overlapEnd - overlapStart;

    opA_prime.length = opA.length - overlapLength;
    opB_prime.length = opB.length - overlapLength;
    
    opA_prime.position = (aStart < bStart) ? aStart : bStart;
    opB_prime.position = (bStart < aStart) ? bStart : aStart;
  }
  return [opA_prime, opB_prime];
}

module.exports = {
  transform
};
