export type {
  CollectionDescription,
  LanguageValue,
  MetadataValues,
} from "../input.ts";

export type IIIFImageInformation = {
  "@context": string;
  id: string;
  type: string;
  profile: string;
  protocol: string;
  width: number;
  height: number;
  maxArea: number;
  sizes: [{ width: number; height: number }];
  tiles: [
    {
      width: number;
      height: number;
      scaleFactors: number[];
    }
  ];
  extraQualities: string[];
  extraFormats: string[];
  extraFeatures: string[];
};
