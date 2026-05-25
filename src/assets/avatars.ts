/** Avatar manifest — maps clean keys to SVG files. */
import brainSvg from "../../avatar_svgs/brain.svg";
import dnaSvg from "../../avatar_svgs/dna.svg";
import fossilSvg from "../../avatar_svgs/fossil.svg";
import colosseumSvg from "../../avatar_svgs/colosseum.svg";
import shakesphereSvg from "../../avatar_svgs/shakesphere.svg";
import pyramidsSvg from "../../avatar_svgs/pyramids.svg";
import trojanSvg from "../../avatar_svgs/trojan.svg";
import newtonSvg from "../../avatar_svgs/newton.svg";
import lincolnSvg from "../../avatar_svgs/lincoln.svg";
import gandhiSvg from "../../avatar_svgs/gandhi.svg";
import tajmahalSvg from "../../avatar_svgs/tajmahal.svg";
import chaplinSvg from "../../avatar_svgs/chaplin.svg";
import defaultSvg from "../../avatar_svgs/default.svg";

export interface AvatarMeta {
  key: string;
  label: string;
  src: string;
  theme: string;
}

export const AVATARS: AvatarMeta[] = [
  { key: "brain", label: "Brain", src: brainSvg, theme: "Biology" },
  { key: "dna", label: "DNA", src: dnaSvg, theme: "Genetics" },
  { key: "fossil", label: "Fossil", src: fossilSvg, theme: "History" },
  { key: "colosseum", label: "Colosseum", src: colosseumSvg, theme: "Rome" },
  { key: "shakesphere", label: "Shakespeare", src: shakesphereSvg, theme: "Literature" },
  { key: "pyramids", label: "Pyramids", src: pyramidsSvg, theme: "Egypt" },
  { key: "trojan", label: "Trojan Horse", src: trojanSvg, theme: "Mythology" },
  { key: "newton", label: "Newton", src: newtonSvg, theme: "Physics" },
  { key: "lincoln", label: "Lincoln", src: lincolnSvg, theme: "US History" },
  { key: "gandhi", label: "Gandhi", src: gandhiSvg, theme: "World History" },
  { key: "tajmahal", label: "Taj Mahal", src: tajmahalSvg, theme: "Architecture" },
  { key: "chaplin", label: "Chaplin", src: chaplinSvg, theme: "Film" },
  { key: "default", label: "QuizGambit", src: defaultSvg, theme: "General" },
];

export function getAvatar(key: string): AvatarMeta {
  return AVATARS.find((a) => a.key === key) || AVATARS[0];
}
