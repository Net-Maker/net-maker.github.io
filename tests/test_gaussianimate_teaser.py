import json
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGE = REPO_ROOT / "public" / "gaussianimate" / "index.html"
PUBLIC_VIDEO = (
    REPO_ROOT
    / "public"
    / "gaussianimate"
    / "static"
    / "videos"
    / "gaussianimate-teaser.mp4"
)
PUBLIC_POSTER = (
    REPO_ROOT
    / "public"
    / "gaussianimate"
    / "static"
    / "images"
    / "teaser-video-poster.webp"
)


class TeaserParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._teaser_depth = 0
        self.video_attrs = None
        self.source_attrs = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if tag == "figure" and "teaser-figure" in classes:
            self._teaser_depth = 1
            return
        if self._teaser_depth:
            self._teaser_depth += 1
            if tag == "video":
                self.video_attrs = attrs
            elif tag == "source" and self.video_attrs is not None:
                self.source_attrs = attrs

    def handle_endtag(self, tag):
        if self._teaser_depth:
            self._teaser_depth -= 1


class GaussiAnimateTeaserTest(unittest.TestCase):
    def test_rendered_teaser_is_an_accessible_inline_video(self):
        parser = TeaserParser()
        parser.feed(PUBLIC_PAGE.read_text(encoding="utf-8"))

        self.assertIsNotNone(parser.video_attrs, "teaser must render a video")
        for attribute in ("autoplay", "muted", "loop", "playsinline", "controls"):
            self.assertIn(attribute, parser.video_attrs)
        self.assertEqual(parser.video_attrs.get("preload"), "metadata")
        self.assertEqual(
            parser.video_attrs.get("poster"),
            "/gaussianimate/static/images/teaser-video-poster.webp?v=1",
        )
        self.assertEqual(
            parser.source_attrs,
            {
                "src": "/gaussianimate/static/videos/gaussianimate-teaser.mp4?v=1",
                "type": "video/mp4",
            },
        )

    def test_published_teaser_is_web_optimized(self):
        self.assertTrue(PUBLIC_VIDEO.is_file(), "published teaser video is missing")
        self.assertTrue(PUBLIC_POSTER.is_file(), "published teaser poster is missing")
        self.assertLess(PUBLIC_VIDEO.stat().st_size, 25 * 1024 * 1024)

        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,codec_type,width,height,pix_fmt",
                "-of",
                "json",
                str(PUBLIC_VIDEO),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        streams = json.loads(probe.stdout)["streams"]
        self.assertEqual(len(streams), 1, "teaser should not ship a silent audio track")
        self.assertEqual(
            streams[0],
            {
                "codec_name": "h264",
                "codec_type": "video",
                "width": 1920,
                "height": 1080,
                "pix_fmt": "yuv420p",
            },
        )

    def test_page_runtime_keeps_primary_teaser_eagerly_playable(self):
        with tempfile.TemporaryDirectory() as profile_dir:
            browser = subprocess.run(
                [
                    "google-chrome",
                    "--headless",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    f"--user-data-dir={profile_dir}",
                    "--virtual-time-budget=2000",
                    "--dump-dom",
                    PUBLIC_PAGE.as_uri(),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=20,
            )

        parser = TeaserParser()
        parser.feed(browser.stdout)
        self.assertIn("autoplay", parser.video_attrs)
        self.assertEqual(
            parser.source_attrs.get("src"),
            "/gaussianimate/static/videos/gaussianimate-teaser.mp4?v=1",
        )
        self.assertNotIn("data-src", parser.source_attrs)


if __name__ == "__main__":
    unittest.main()
