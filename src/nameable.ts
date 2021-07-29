export default interface Nameable {
    getRootNamespace(): Promise<string | undefined>;
} //eslint-disable-line
