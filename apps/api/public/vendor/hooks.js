import { options as n } from "./preact.js";
var t,
  r,
  u,
  i,
  o = 0,
  f = [],
  c = n,
  e = c.__b,
  a = c.__r,
  v = c.diffed,
  l = c.__c,
  m = c.unmount,
  p = c.__;
function s(n, t) {
  c.__h && c.__h(r, n, o || t), (o = 0);
  var u = r.__H || (r.__H = { __: [], __h: [] });
  return n >= u.__.length && u.__.push({}), u.__[n];
}
function d(n) {
  return (o = 1), y(D, n);
}
function y(n, u, i) {
  var o = s(t++, 2);
  if (
    ((o.t = n),
    !o.__c &&
      ((o.__ = [
        i ? i(u) : D(void 0, u),
        (n) => {
          var t = o.__N ? o.__N[0] : o.__[0],
            r = o.t(t, n);
          t !== r && ((o.__N = [r, o.__[1]]), o.__c.setState({}));
        },
      ]),
      (o.__c = r),
      !r.__f))
  ) {
    var f = function (n, t, r) {
      if (!o.__c.__H) return !0;
      var u = !1,
        i = o.__c.props !== n;
      if (
        (o.__c.__H.__.some((n) => {
          if (n.__N) {
            u = !0;
            var t = n.__[0];
            (n.__ = n.__N), (n.__N = void 0), t !== n.__[0] && (i = !0);
          }
        }),
        c)
      ) {
        var f = c.call(this, n, t, r);
        return u ? f || i : f;
      }
      return !u || i;
    };
    r.__f = !0;
    var c = r.shouldComponentUpdate,
      e = r.componentWillUpdate;
    (r.componentWillUpdate = function (n, t, r) {
      if (this.__e) {
        var u = c;
        (c = void 0), f(n, t, r), (c = u);
      }
      e && e.call(this, n, t, r);
    }),
      (r.shouldComponentUpdate = f);
  }
  return o.__N || o.__;
}
function h(n, u) {
  var i = s(t++, 3);
  !c.__s && C(i.__H, u) && ((i.__ = n), (i.u = u), r.__H.__h.push(i));
}
function _(n, u) {
  var i = s(t++, 4);
  !c.__s && C(i.__H, u) && ((i.__ = n), (i.u = u), r.__h.push(i));
}
function A(n) {
  return (o = 5), T(() => ({ current: n }), []);
}
function F(n, t, r) {
  (o = 6),
    _(
      () => {
        if ("function" == typeof n) {
          var r = n(t());
          return () => {
            n(null), r && "function" == typeof r && r();
          };
        }
        if (n) return (n.current = t()), () => (n.current = null);
      },
      null == r ? r : r.concat(n),
    );
}
function T(n, r) {
  var u = s(t++, 7);
  return C(u.__H, r) && ((u.__ = n()), (u.__H = r), (u.__h = n)), u.__;
}
function q(n, t) {
  return (o = 8), T(() => n, t);
}
function x(n) {
  var u = r.context[n.__c],
    i = s(t++, 9);
  return (i.c = n), u ? (null == i.__ && ((i.__ = !0), u.sub(r)), u.props.value) : n.__;
}
function P(n, t) {
  c.useDebugValue && c.useDebugValue(t ? t(n) : n);
}
function b(n) {
  var u = s(t++, 10),
    i = d();
  return (
    (u.__ = n),
    r.componentDidCatch ||
      (r.componentDidCatch = (n, t) => {
        u.__ && u.__(n, t), i[1](n);
      }),
    [
      i[0],
      () => {
        i[1](void 0);
      },
    ]
  );
}
function g() {
  var n = s(t++, 11);
  if (!n.__) {
    for (var u = r.__v; null !== u && !u.__m && null !== u.__; ) u = u.__;
    var i = u.__m || (u.__m = [0, 0]);
    n.__ = "P" + i[0] + "-" + i[1]++;
  }
  return n.__;
}
function j() {
  for (var n; (n = f.shift()); ) {
    var t = n.__H;
    if (n.__P && t)
      try {
        t.__h.some(z), t.__h.some(B), (t.__h = []);
      } catch (r) {
        (t.__h = []), c.__e(r, n.__v);
      }
  }
}
(c.__b = (n) => {
  (r = null), e && e(n);
}),
  (c.__ = (n, t) => {
    n && t.__k && t.__k.__m && (n.__m = t.__k.__m), p && p(n, t);
  }),
  (c.__r = (n) => {
    a && a(n), (t = 0);
    var i = (r = n.__c).__H;
    i &&
      (u === r
        ? ((i.__h = []),
          (r.__h = []),
          i.__.some((n) => {
            n.__N && (n.__ = n.__N), (n.u = n.__N = void 0);
          }))
        : (i.__h.some(z), i.__h.some(B), (i.__h = []), (t = 0))),
      (u = r);
  }),
  (c.diffed = (n) => {
    v && v(n);
    var t = n.__c;
    t &&
      t.__H &&
      (t.__H.__h.length &&
        ((1 !== f.push(t) && i === c.requestAnimationFrame) ||
          ((i = c.requestAnimationFrame) || w)(j)),
      t.__H.__.some((n) => {
        n.u && ((n.__H = n.u), (n.u = void 0));
      })),
      (u = r = null);
  }),
  (c.__c = (n, t) => {
    t.some((n) => {
      try {
        n.__h.some(z), (n.__h = n.__h.filter((n) => !n.__ || B(n)));
      } catch (r) {
        t.some((n) => {
          n.__h && (n.__h = []);
        }),
          (t = []),
          c.__e(r, n.__v);
      }
    }),
      l && l(n, t);
  }),
  (c.unmount = (n) => {
    m && m(n);
    var t,
      r = n.__c;
    r &&
      r.__H &&
      (r.__H.__.some((n) => {
        try {
          z(n);
        } catch (n) {
          t = n;
        }
      }),
      (r.__H = void 0),
      t && c.__e(t, r.__v));
  });
var k = "function" == typeof requestAnimationFrame;
function w(n) {
  var t,
    r = () => {
      clearTimeout(u), k && cancelAnimationFrame(t), setTimeout(n);
    },
    u = setTimeout(r, 35);
  k && (t = requestAnimationFrame(r));
}
function z(n) {
  var t = r,
    u = n.__c;
  "function" == typeof u && ((n.__c = void 0), u()), (r = t);
}
function B(n) {
  var t = r;
  (n.__c = n.__()), (r = t);
}
function C(n, t) {
  return !n || n.length !== t.length || t.some((t, r) => t !== n[r]);
}
function D(n, t) {
  return "function" == typeof t ? t(n) : t;
}
export {
  _ as useLayoutEffect,
  A as useRef,
  b as useErrorBoundary,
  d as useState,
  F as useImperativeHandle,
  g as useId,
  h as useEffect,
  P as useDebugValue,
  q as useCallback,
  T as useMemo,
  x as useContext,
  y as useReducer,
};
//# sourceMappingURL=hooks.module.js.map
