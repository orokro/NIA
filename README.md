# Natsu Island 3D Experience

An interactive 3D unboxing and gameplay demo featuring a custom Game Boy emulator integrated into a Three.js scene.

## The Experience

This project takes the user through a multi-stage interactive journey:
- **Unbagging:** Click to unfurl and open the paper bag.
- **Unboxing:** Open the Game Boy box using complex morph-target animations.
- **Insertion:** Watch the game cartridge flip and slide into the handheld.
- **Power On:** Toggle the power switch to initialize the emulator and start playing.

## Controls

### Navigation
- **Rotate:** Left Click + Drag
- **Zoom:** Scroll Wheel
- **Pan:** Right Click + Drag

### Gameplay
- **D-Pad:** WASD / Arrow Keys
- **A Button:** J / Z / Alt
- **B Button:** K / X / Ctrl
- **Start:** Enter
- **Select:** Shift

## Credits

### 2D Art
- **GameBox / Label Art:** [Erogeist](https://bsky.app/profile/erogeist.bsky.social)
- **GameBox / Label Logo:** [Frodo](https://bsky.app/profile/frodotbagginzz.bsky.social)
- **Lil Crab Mascot Design:** [Inu Strider](https://bsky.app/profile/inustrider.bsky.social)

### 3D Models
- **GameBoy Classic:** [Sketchfab Model](https://sketchfab.com/3d-models/gameboy-classic-854c46e14ce24779ad64ae74cb9b9089)
- **GameBoy Box:** [Sketchfab Model](https://sketchfab.com/3d-models/gameboy-tetris-box-067a53c4821047888aea55eadbafb3df)
- **GameBoy Cartridge:** Greg Miller (orokro)

### Game Development
- **Game Music:** ZbotZero
- **Sprites/Tiles/Logic:** Orokro / Greg Miller

---

## About the Emulator (binjgb)

This project utilizes a fork of binji's Game Boy emulator built as a WebAssembly module. It includes changes from [Daid's fork](https://github.com/daid/binjgb) and others to better support GB Studio.

### License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
