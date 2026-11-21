// type X = "abc" | "$def" | "ghi";
// type Y = "abc" | "def" | "ghi";

// type HasParam<Z extends {}> = keyof {
//   [Key in Z as Key extends `$${string}` ? Key : never]: Key;
// };

// type A = HasParam<X>;
// type B = HasParam<Y>;

// type a = (opts: { x: number; y: Record<string, unknown> }) => Promise<void>;
// type b = (opts: { y: { hello: string } }) => Promise<void>;

// type c = (
//   ...args: Parameters<a> & Parameters<b>
// ) => ReturnType<a> & ReturnType<b>;

// function x(g: c) {
//   return g;
// }

// // x(async ({ x, y }) => { })

// type Xx = {
//   [key: string]: (opts: { one: number }) => void;
// };

// // type R = {
// //   a?: Xx,
// //   b?: Xx,
// // }

// type Zz = (opts: { one: number; two: string }) => void;

// const zz = {
//   hello: (opts: { one: number; two: string }) => {
//     console.log(opts);
//   },
// };

// type Tree<T extends string = string> = T extends string ? {
//     [Key in T]: Key; //Tree | ((arg: { [k in Key]: k }) => void);
//   }
//   : never;

// const x: Tree = {
//   b: "c",
// };

type Tree<Obj extends {}, Keys extends string = never> = {
  [Key in string & keyof Obj]:
    | Tree<Obj, Key | Keys>
    | ((arg: { [K in Key | Keys]: string }) => void);
};

function myFunc<Obj extends {}>(x: Tree<Obj>) {
  return x;
}

const x = myFunc({
  b: {
    c: (arg) => {},
  },
});
