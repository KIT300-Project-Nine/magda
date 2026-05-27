// Fix RSuite compound component JSX compatibility with @types/react 18.2.x.
// RsRefForwardingComponent returns ReactElement | null, which doesn't satisfy
// the JSX element type check because ReactPortal (in the ReactNode union)
// requires a 'children' property that plain ReactElement lacks.
import type { ReactElement } from "react";

/// <reference types="react-scripts" />

declare module "*.scss";
declare module "*.css";

declare global {
    namespace JSX {
        type Element = ReactElement<any, any> | null;
    }
}
export {};
