import { Fragment, type ReactNode } from "react";
import { Text as NativeText, type TextProps } from "react-native";
import { useI18n } from "./i18n";

function localizeNode(
  node: ReactNode,
  translate: boolean,
  t: (text: string) => string,
): ReactNode {
  if (!translate) return node;
  if (typeof node === "string") return t(node);
  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={index}>{localizeNode(child, translate, t)}</Fragment>
    ));
  }
  return node;
}

export function Text({
  children,
  translate = true,
  ...props
}: TextProps & { translate?: boolean }) {
  const { t } = useI18n();
  return <NativeText {...props}>{localizeNode(children, translate, t)}</NativeText>;
}
