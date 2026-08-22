declare module 'postman-runtime' {
  const runtime: any;
  export default runtime;
}

declare module 'postman-collection' {
  const collection: any;
  export default collection;
}

declare module '@usebruno/js' {
  export class ScriptRuntime {
    constructor(options?: { runtime?: 'quickjs' | 'nodevm' });
    runRequestScript(...args: any[]): Promise<any>;
    runResponseScript(...args: any[]): Promise<any>;
  }
  export class TestRuntime {
    constructor(options?: { runtime?: 'quickjs' | 'nodevm' });
    runTests(...args: any[]): Promise<any>;
  }
  export class AssertRuntime {
    constructor(options?: { runtime?: 'quickjs' | 'nodevm' });
    runAssertions(...args: any[]): any[];
  }
  export class VarsRuntime {
    constructor(options?: { runtime?: 'quickjs' | 'nodevm' });
    runPostResponseVars(...args: any[]): any;
  }
}
