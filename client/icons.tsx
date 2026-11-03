import type { PluginIconProps } from "@getpaseo/plugin/client";
import { Image } from "react-native";

/** Brand spark used in the Paseo sidebar and plugin header. */
export function AutoWonderMark({ size }: PluginIconProps) {
  return (
    <Image
      source={{ uri: AUTO_WONDER_MARK_DATA }}
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}

const AUTO_WONDER_MARK_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABmJLR0QA/wD/AP+gvaeTAAAFeUlEQVRoge1ZW2xUVRRd+5zbmVo6banySElsfKRI6oeIkdZibAzBYHwEtU3AgPpTMBF8hPDBFx8GHxETFE0lfiDGIFONUWIIWEl8tBQ1/oFtJk3B2IYCth2wY6f3nL396LQz7bync7/sSprsTs4+e61999l333uBBSxgAQtIh+aBgarmgYEqL2MoLzfXQANBr/UyhqcCDKtGC2rwMobj5eaWqBEW7GUM8mrjjaGQ/7oqvSJCEo6Gl56vr5/Mx//F4YnbXRH5ePlNA5nWeVZCN6j0URaqYKHKcl/Vxnz9GWq9A70+2zrPBFiizSwEKwQLtTnvDVg2ichT2ZZ5UkJNvVcDRk9eZqEyBkEYkXE4y/vuWnIjF/8dw9GnRdABAERoaV/m/zLdWk8OsetEdzGrMhECA2BQmV/kJQBvpPNpEdGLh937iLBVRHYgllwRHN8+PNkugk9Hl5X81kFkE/2KfgXWXbq0OBot6bdCiwUEFoCFIKCwQekdvasq/p7rs0/EuTzsbgPJMyJ4GIB/zpIoEc5A6Ivly0qO7iMynglYExo6IEyvsRAYBIkJiNkHeuuX7M7kv+NaZAWM+kxAD00RlB/g8LPtt5QNplpfVAH39g09KKAzIuQwaCrzAiTYxkI1999d3ZVpn7YRqaRJtw8AxFey8nA1hdOtLVoXWn1hqFagPmchx8oUYRYgbhMY5IARvO330dpMex2upjBIjoDkSCbyRROw+sJQrSg6zUI10+WSQHrGFiYoixo/4/SqLCIY0gnh77LFnreANX1D60Spboaqs9P1Huv/nPBHDGgDaAtoizpnAl33/DjSlG7f8kl/V5lb2p0tfsFn4P4//rrZVXovC+2K1zwgiRnHlCBlAc2Asok2oC0MMd5TrPf/sj65O+WCvAU09V4N/Et2JwN7RFAZ7zCxlplgQwhqhmyijdmiGGPa4m027qGuJ3O72eUlYGMo5L+Gsg2WVQuATSxUntwiYzctmbLB8UwrS4lZjwmhBDv2u2BCGerUBh2+ReNfnHi8JlKQgDX9/ZU+8TWKqAYGGlmoUYQCMwQR7zKp7LlZn8543J5dSlM2zRGIG9qgWzN6RNDjWHu2Y3t1UkdKO0pY0QKQMAszSObcVZMFABCheHnMLZl0pcSx32YJBBSDNZMoJlGGRdK0m5xK6M5QyF9mAhtA1GKZNjGoXGbVOwGSGJxSZ53n1n9SKU1oi07N6qizqPzrjlbK+gyR9yGuP3+l3ELtZMEeBlXNKplYGaTLegZRY5rlrVLf5KGO1qX/5MOn4DZafz5cPcG8V1l5WVk4qbM++2qkONRGsxw0Du0/1Vo5UgiPec9CK38dadJCQWVRk/ZQpsy6DCqjWr/dWpH1ZuWpAABY1TVa6xOc1hZ1SaWUQpSy6HOM3XBiW/Wf841dtGl09fejtQ6hS1lakdTfZ7VIGdSGHygGeaDI43TDqfBaxfKTZpSk6e9Gu9T8zfMVGcfpfFDUh/qeRyrPaab3p4c2x1LiAAftysFikgc8eCshIq9rSyPaJJA3gDYY06TSPhMXiqIL+PmxqlFt5Z2ZrMdEKENvfvVcYRNnJnjyXqjU5x7SBpEp8gRtVMSJTnzgRaycDnEwKJovum0g1DHJR1t2+3uz+TzxSfi4ttSqLKCFjgXbAlvmTzcZOV0Bvui2CeFDAV4hUZ3BoOhsPiUuHZs5A64cmz/V1MhNALAy/p/UjA8ikM0nEgmc1BbXtUHYXA2cKpxiZuR2BpS0AzQEACR494VXaSyby8ldFNWGerRBd8e+7FNlocjp1eKW3f7eYFBuHR9EIBfyM5sbnCUhT78P5PxutLWVLICcyQOAtnRWe/yBw9MvNKLdcyav6X4BC1jA/w7/AZYgL32mYb0BAAAAAElFTkSuQmCC";

/** Inline SVG for contributions that accept Paseo's serializable icon form. */
export const AUTO_WONDER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1.5c1 5.2 3.3 7.5 8.5 8.5-5.2 1-7.5 3.3-8.5 8.5-1-5.2-3.3-7.5-8.5-8.5 5.2-1 7.5-3.3 8.5-8.5z" fill="currentColor"/><circle cx="21.2" cy="4.2" r="1.5" fill="currentColor"/></svg>`;
