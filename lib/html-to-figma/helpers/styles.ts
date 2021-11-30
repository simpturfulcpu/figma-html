import { LayerNode, WithRef } from "../types/nodes";
import { traverse } from "./nodes";
import { getRgb, parseBoxShadowStr, parseUnits } from "./parsers";

function setData(
  node: LayerNode & { data?: { [index: string]: string } },
  key: string,
  value: string
) {
  if (!node.data) {
    node.data = {};
  }
  node.data[key] = value;
}

export function getAppliedComputedStyles(
  element: Element,
  pseudo?: string
): { [key: string]: string } {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    return {};
  }

  const styles = getComputedStyle(element, pseudo);

  const list: (keyof React.CSSProperties)[] = [
    "opacity",
    "backgroundColor",
    "border",
    "borderTop",
    "borderLeft",
    "borderRight",
    "borderBottom",
    "borderRadius",
    "backgroundImage",
    "borderColor",
    "boxShadow",
  ];

  const color = styles.color;

  const defaults: any = {
    transform: "none",
    opacity: "1",
    borderRadius: "0px",
    backgroundImage: "none",
    backgroundPosition: "0% 0%",
    backgroundSize: "auto",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundAttachment: "scroll",
    border: "0px none " + color,
    borderTop: "0px none " + color,
    borderBottom: "0px none " + color,
    borderLeft: "0px none " + color,
    borderRight: "0px none " + color,
    borderWidth: "0px",
    borderColor: color,
    borderStyle: "none",
    boxShadow: "none",
    fontWeight: "400",
    textAlign: "start",
    justifyContent: "normal",
    alignItems: "normal",
    alignSelf: "auto",
    flexGrow: "0",
    textDecoration: "none solid " + color,
    lineHeight: "normal",
    letterSpacing: "normal",
    backgroundRepeat: "repeat",
    zIndex: "auto", // TODO
  };

  function pick<T extends { [key: string]: V }, V = any>(
    object: T,
    paths: (keyof T)[]
  ) {
    const newObject: Partial<T> = {};
    paths.forEach((path) => {
      if (object[path]) {
        if (object[path] !== defaults[path]) {
          newObject[path] = object[path];
        }
      }
    });
    return newObject;
  }

  return pick(styles, list as any) as any;
}

export function addConstraints(layers: LayerNode[]) {
  layers.forEach((layer) => {
    traverse(layer, (child) => {
      if (child.type === "SVG") {
        child.constraints = {
          horizontal: "CENTER",
          vertical: "MIN",
        };
      } else {
        const ref = child.ref;
        if (ref) {
          const el = ref instanceof HTMLElement ? ref : ref.parentElement;
          const parent = el && el.parentElement;
          if (el && parent) {
            const currentDisplay = el.style.display;
            el.style.setProperty("display", "none", "!important");
            let computed = getComputedStyle(el);
            const hasFixedWidth =
              computed.width && computed.width.trim().endsWith("px");
            const hasFixedHeight =
              computed.height && computed.height.trim().endsWith("px");
            el.style.display = currentDisplay;
            const parentStyle = getComputedStyle(parent);
            let hasAutoMarginLeft = computed.marginLeft === "auto";
            let hasAutoMarginRight = computed.marginRight === "auto";
            let hasAutoMarginTop = computed.marginTop === "auto";
            let hasAutoMarginBottom = computed.marginBottom === "auto";

            computed = getComputedStyle(el);

            if (["absolute", "fixed"].includes(computed.position!)) {
              setData(child, "position", computed.position!);
            }

            if (hasFixedHeight) {
              setData(child, "heightType", "fixed");
            }
            if (hasFixedWidth) {
              setData(child, "widthType", "fixed");
            }

            const isInline =
              computed.display && computed.display.includes("inline");

            if (isInline) {
              const parentTextAlign = parentStyle.textAlign;
              if (parentTextAlign === "center") {
                hasAutoMarginLeft = true;
                hasAutoMarginRight = true;
              } else if (parentTextAlign === "right") {
                hasAutoMarginLeft = true;
              }

              if (computed.verticalAlign === "middle") {
                hasAutoMarginTop = true;
                hasAutoMarginBottom = true;
              } else if (computed.verticalAlign === "bottom") {
                hasAutoMarginTop = true;
                hasAutoMarginBottom = false;
              }

              setData(child, "widthType", "shrink");
            }
            const parentJustifyContent =
              parentStyle.display === "flex" &&
              ((parentStyle.flexDirection === "row" &&
                parentStyle.justifyContent) ||
                (parentStyle.flexDirection === "column" &&
                  parentStyle.alignItems));

            if (parentJustifyContent === "center") {
              hasAutoMarginLeft = true;
              hasAutoMarginRight = true;
            } else if (
              parentJustifyContent &&
              (parentJustifyContent.includes("end") ||
                parentJustifyContent.includes("right"))
            ) {
              hasAutoMarginLeft = true;
              hasAutoMarginRight = false;
            }

            const parentAlignItems =
              parentStyle.display === "flex" &&
              ((parentStyle.flexDirection === "column" &&
                parentStyle.justifyContent) ||
                (parentStyle.flexDirection === "row" &&
                  parentStyle.alignItems));
            if (parentAlignItems === "center") {
              hasAutoMarginTop = true;
              hasAutoMarginBottom = true;
            } else if (
              parentAlignItems &&
              (parentAlignItems.includes("end") ||
                parentAlignItems.includes("bottom"))
            ) {
              hasAutoMarginTop = true;
              hasAutoMarginBottom = false;
            }

            if (child.type === "TEXT") {
              if (computed.textAlign === "center") {
                hasAutoMarginLeft = true;
                hasAutoMarginRight = true;
              } else if (computed.textAlign === "right") {
                hasAutoMarginLeft = true;
                hasAutoMarginRight = false;
              }
            }

            child.constraints = {
              horizontal:
                hasAutoMarginLeft && hasAutoMarginRight
                  ? "CENTER"
                  : hasAutoMarginLeft
                  ? "MAX"
                  : "SCALE",
              vertical:
                hasAutoMarginBottom && hasAutoMarginTop
                  ? "CENTER"
                  : hasAutoMarginTop
                  ? "MAX"
                  : "MIN",
            };
          }
        } else {
          child.constraints = {
            horizontal: "SCALE",
            vertical: "MIN",
          };
        }
      }
    });
  });
}

export const setBorderRadii = ({
  computedStyle,
  rectNode,
}: {
  computedStyle: CSSStyleDeclaration;
  rectNode: WithRef<RectangleNode>;
}) => {
  const borderTopLeftRadius = parseUnits(computedStyle.borderTopLeftRadius);
  if (borderTopLeftRadius) {
    rectNode.topLeftRadius = borderTopLeftRadius.value;
  }
  const borderTopRightRadius = parseUnits(computedStyle.borderTopRightRadius);
  if (borderTopRightRadius) {
    rectNode.topRightRadius = borderTopRightRadius.value;
  }
  const borderBottomRightRadius = parseUnits(
    computedStyle.borderBottomRightRadius
  );
  if (borderBottomRightRadius) {
    rectNode.bottomRightRadius = borderBottomRightRadius.value;
  }
  const borderBottomLeftRadius = parseUnits(
    computedStyle.borderBottomLeftRadius
  );
  if (borderBottomLeftRadius) {
    rectNode.bottomLeftRadius = borderBottomLeftRadius.value;
  }
};

const capitalize = (str: string) => str[0].toUpperCase() + str.substring(1);

export function addStrokesFromIndividualBorders({
  dir,
  rect,
  computedStyle,
  layers,
  el,
}: {
  dir: "top" | "left" | "right" | "bottom";
  rect: Pick<DOMRect, "top" | "left" | "right" | "bottom" | "width" | "height">;
  computedStyle: CSSStyleDeclaration;
  layers: LayerNode[];
  el: Element;
}) {
  const computed = computedStyle[("border" + capitalize(dir)) as any];
  if (computed) {
    const parsed = computed.match(/^([\d\.]+)px\s*(\w+)\s*(.*)$/);
    if (parsed) {
      let [_match, borderWidth, type, color] = parsed;
      if (borderWidth && borderWidth !== "0" && type !== "none" && color) {
        const rgb = getRgb(color);
        if (rgb) {
          const width = ["top", "bottom"].includes(dir)
            ? rect.width
            : parseFloat(borderWidth);
          const height = ["left", "right"].includes(dir)
            ? rect.height
            : parseFloat(borderWidth);
          layers.push({
            ref: el,
            type: "RECTANGLE",
            x:
              dir === "left"
                ? rect.left - width
                : dir === "right"
                ? rect.right
                : rect.left,
            y:
              dir === "top"
                ? rect.top - height
                : dir === "bottom"
                ? rect.bottom
                : rect.top,
            width,
            height,
            fills: [
              {
                type: "SOLID",
                color: { r: rgb.r, b: rgb.b, g: rgb.g },
                opacity: rgb.a || 1,
              } as SolidPaint,
            ] as any,
          } as WithRef<RectangleNode>);
        }
      }
    }
  }
}

export const addStrokesFromBorder = ({
  computedStyle: { border },
  rectNode,
}: {
  computedStyle: CSSStyleDeclaration;
  rectNode: WithRef<RectangleNode>;
}) => {
  if (border) {
    const parsed = border.match(/^([\d\.]+)px\s*(\w+)\s*(.*)$/);
    if (parsed) {
      let [_match, width, type, color] = parsed;
      if (width && width !== "0" && type !== "none" && color) {
        const rgb = getRgb(color);
        if (rgb) {
          rectNode.strokes = [
            {
              type: "SOLID",
              color: { r: rgb.r, b: rgb.b, g: rgb.g },
              opacity: rgb.a || 1,
            },
          ];
          rectNode.strokeWeight = Math.round(parseFloat(width));
        }
      }
    }
  }
};
export const getShadowEffects = ({
  computedStyle: { boxShadow },
}: {
  computedStyle: CSSStyleDeclaration;
}) => {
  if (boxShadow && boxShadow !== "none") {
    const parsed = parseBoxShadowStr(boxShadow);
    const color = getRgb(parsed.color);
    if (color) {
      const shadowEffect: ShadowEffect = {
        color,
        type: "DROP_SHADOW",
        radius: parsed.blurRadius,
        blendMode: "NORMAL",
        visible: true,
        offset: {
          x: parsed.offsetX,
          y: parsed.offsetY,
        },
      };
      return [shadowEffect];
    }
  }

  return undefined;
};