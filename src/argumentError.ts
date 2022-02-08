export default class ArgumentError extends Error {
    constructor(argumentName: string) {
        super(`Argument '${argumentName}' is invalid`);
    }
}