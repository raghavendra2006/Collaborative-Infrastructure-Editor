function applyOperation(content, operation) {
    if (!content) content = "";
    if (operation.type === 'insert') {
        if (operation.value === "") return content; // NOOP
        const pos = Math.min(operation.position, content.length);
        return content.slice(0, pos) + operation.value + content.slice(pos);
    } else if (operation.type === 'delete') {
        if (operation.length === 0) return content; // NOOP
        const pos = Math.min(operation.position, content.length);
        const len = operation.length;
        return content.slice(0, pos) + content.slice(pos + len);
    }
    return content;
}

module.exports = {
    applyOperation
};
