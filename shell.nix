{ pkgs ? import <nixpkgs> { } }:
let
  browsers = pkgs.playwright-driver.browsers.override {
    withChromium = false;
    withWebkit = false;
    withChromiumHeadlessShell = false;
  };
in
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_24
    pkgs.patchelf
  ];
  shellHook = ''
    export PLAYWRIGHT_BROWSERS_PATH=${browsers}
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
  '';
}
