import Image from "next/image";

type Props = {
  /** header = compacto na barra; hero = login / destaque */
  variant?: "header" | "hero";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ variant = "header", className = "", priority }: Props) {
  const isHero = variant === "hero";
  return (
    <Image
      src="/brand/logo.png"
      alt="Equilíbrio Fisioterapia e Bem Estar"
      width={isHero ? 320 : 220}
      height={isHero ? 320 : 220}
      priority={priority}
      className={
        isHero
          ? `mx-auto h-auto w-56 sm:w-64 ${className}`
          : `h-16 w-auto object-contain sm:h-[4.5rem] ${className}`
      }
    />
  );
}
