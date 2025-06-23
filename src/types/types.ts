type LanguageValue = {
  [key: string]: (string | number) | (string | number)[];
};

export type MetadataValues = {
  [key: string]: LanguageValue;
};

export type CollectionDescription = {
  collection: {
    guid?: string;
    metadata: MetadataValues;
  };
  items: [
    {
      guid?: string;
      dlcs: string | number;
      tresor?: string;
      oclc?: number | number[];
      metadata?: MetadataValues;
    }
  ];
};

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
