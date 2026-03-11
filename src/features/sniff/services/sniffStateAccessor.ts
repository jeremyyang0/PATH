import { SniffViewStateStore } from './sniffViewStateStore';

let currentStateStore: SniffViewStateStore | undefined;

export function setSniffStateStore(stateStore: SniffViewStateStore): void {
    currentStateStore = stateStore;
}

export function getSniffStateStore(): SniffViewStateStore | undefined {
    return currentStateStore;
}
