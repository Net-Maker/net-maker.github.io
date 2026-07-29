import { useEffect, useId, useRef, useState } from "react";

const ANIMATION_DURATION = 8500;

export function GaussiAnimateSignature() {
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState("write");
  const id = useId().replace(/:/g, "");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [
      window.setTimeout(() => setPhase("retract"), 3600),
      window.setTimeout(() => setPhase("continue"), 4550),
      window.setTimeout(() => setPhase("complete"), 7200),
    ];
    setPhase("write");
    return () => timers.current.forEach(window.clearTimeout);
  }, [cycle]);

  const replay = () => setCycle((value) => value + 1);

  return (
    <section className="signature-study" aria-labelledby={`${id}-title`}>
      <div className="signature-meta">
        <span id={`${id}-title`}>Motion study</span>
        <span>{phase}</span>
      </div>

      <div
        key={cycle}
        className="signature-canvas is-playing"
        style={{ "--signature-duration": `${ANIMATION_DURATION}ms` } as React.CSSProperties}
      >
        <svg
          viewBox="0 0 1180 220"
          role="img"
          aria-label="GaussiAnimate written as one restrained cursive motion"
        >
          <defs>
            <linearGradient id={`${id}-research-accent`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2457ff" />
              <stop offset="0.48" stopColor="#7138ff" />
              <stop offset="1" stopColor="#ff3b24" />
            </linearGradient>
          </defs>

          <g className="signature-prefix">
            <path
              pathLength="1"
              d="M 92 166 C 42 178 30 104 62 67 C 92 31 159 31 178 65 C 193 92 159 112 122 112 C 94 112 72 102 66 88 C 55 122 67 160 102 165 C 134 170 166 148 178 116"
            />
            <path
              pathLength="1"
              d="M 175 119 C 189 88 220 82 227 101 C 234 120 211 143 192 136 C 174 129 184 101 207 98 C 225 96 232 113 231 128 C 230 144 247 142 259 126 C 268 115 272 102 276 92 C 271 111 268 132 278 138 C 291 146 309 128 317 111 C 322 101 326 92 329 84 C 325 105 317 130 326 139 C 336 149 354 133 365 117 C 373 105 379 93 381 85 C 378 105 368 131 377 140 C 386 149 403 136 414 120 C 423 107 428 92 430 82 C 425 105 415 135 424 143 C 434 152 452 134 461 118 C 468 105 472 92 472 83 C 469 107 464 131 471 140 C 480 151 500 132 510 116 C 517 104 520 93 521 84 C 517 103 510 128 517 138 C 526 151 547 132 557 114"
            />
            <path
              className="signature-dot signature-dot-one"
              pathLength="1"
              d="M 432 63 C 433 60 434 57 435 54"
            />
            <path
              className="signature-dot signature-dot-two"
              pathLength="1"
              d="M 521 63 C 522 60 523 57 524 54"
            />
          </g>

          <path
            className="signature-tail"
            pathLength="1"
            d="M 555 115 C 570 86 600 80 608 100 C 617 120 594 143 575 136 C 557 129 566 101 590 98 C 609 96 617 113 615 130 C 614 142 625 144 637 128 C 648 113 653 99 656 86 C 651 106 646 130 654 140 C 665 153 683 132 694 116 C 703 103 706 91 707 82 C 704 104 699 129 707 139 C 717 152 739 132 749 115 C 758 100 764 89 767 80 C 764 100 757 126 765 136 C 774 148 793 132 806 113"
          />

          <g className="signature-animate">
            <path
              pathLength="1"
              d="M 555 139 C 573 101 595 67 620 48 C 637 35 654 39 657 55 C 660 72 644 94 616 111 C 600 121 581 130 560 136 C 580 131 602 127 626 126"
            />
            <path
              pathLength="1"
              d="M 626 126 C 641 93 673 83 681 103 C 689 123 666 145 646 138 C 628 131 637 103 661 100 C 680 98 688 115 686 132 C 685 145 699 145 711 129 C 721 116 727 101 730 88 C 726 108 720 133 728 142 C 738 154 758 135 768 118 C 776 105 781 93 783 84 C 778 107 770 135 779 143 C 789 153 806 137 817 120 C 826 106 831 93 833 84 C 828 108 821 136 829 144 C 840 154 858 135 868 118 C 876 105 880 93 882 84 C 878 105 871 132 879 141 C 890 154 910 134 920 116 C 928 102 934 91 937 82 C 933 103 925 129 933 139 C 943 151 962 135 974 118 C 983 105 989 92 991 82 C 986 105 980 132 988 141 C 998 153 1018 134 1029 117 C 1038 103 1043 91 1045 82 C 1041 103 1034 128 1042 138 C 1052 151 1072 133 1085 112"
            />
            <path
              className="signature-cross"
              pathLength="1"
              d="M 887 100 C 910 98 933 96 956 95"
            />
            <path
              className="signature-dot signature-dot-three"
              pathLength="1"
              d="M 834 63 C 835 60 836 57 837 54"
            />
          </g>

          <path
            className="signature-accent"
            pathLength="1"
            stroke={`url(#${id}-research-accent)`}
            d="M 92 166 C 42 178 30 104 62 67 C 92 31 159 31 178 65 M 555 139 C 573 101 595 67 620 48 C 637 35 654 39 657 55"
          />
        </svg>
      </div>

      <div className="signature-timeline" aria-hidden="true">
        <span>01</span>
        <span>02</span>
        <span>03</span>
        <span>04</span>
      </div>

      <button className="signature-replay" type="button" onClick={replay}>
        Replay
      </button>
    </section>
  );
}
