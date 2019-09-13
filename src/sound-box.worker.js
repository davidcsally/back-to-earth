/* -*- mode: javascript; tab-width: 4; indent-tabs-mode: nil; -*-
 *
 * Copyright (c) 2011-2013 Marcus Geelnard
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 * 1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 * 2. Altered source versions must be plainly marked as such, and must not be
 *    misrepresented as being the original software.
 *
 * 3. This notice may not be removed or altered from any source
 *    distribution.
 *
 */

"use strict";

let Soundbox = function () {
  //--------------------------------------------------------------------------
  // Private methods
  //--------------------------------------------------------------------------

  // Oscillators
  var osc_sin = function (value) {
    return Math.sin(value * 6.283184);
  };

  var osc_saw = function (value) {
    return 2 * (value % 1) - 1;
  };

  var osc_square = function (value) {
    return value % 1 < 0.5 ? 1 : -1;
  };

  var osc_tri = function (value) {
    var v2 = (value % 1) * 4;
    if (v2 < 2) return v2 - 1;
    return 3 - v2;
  };

  var getnotefreq = function (n) {
    // 174.61.. / 44100 = 0.003959503758 (F3)
    return 0.003959503758 * Math.pow(2, (n - 128) / 12);
  };

  var createNote = function (instr, n, rowLen) {
    var osc1 = mOscillators[instr.i[0]],
      o1vol = instr.i[1],
      o1xenv = instr.i[3],
      osc2 = mOscillators[instr.i[4]],
      o2vol = instr.i[5],
      o2xenv = instr.i[8],
      noiseVol = instr.i[9],
      attack = instr.i[10] * instr.i[10] * 4,
      sustain = instr.i[11] * instr.i[11] * 4,
      release = instr.i[12] * instr.i[12] * 4,
      releaseInv = 1 / release,
      arp = instr.i[13],
      arpInterval = rowLen * Math.pow(2, 2 - instr.i[14]);

    var noteBuf = new Int32Array(attack + sustain + release);

    // Re-trig oscillators
    var c1 = 0,
      c2 = 0;

    // Local variables.
    var j, j2, e, t, rsample, o1t, o2t;

    // Generate one note (attack + sustain + release)
    for (j = 0, j2 = 0; j < attack + sustain + release; j++ , j2++) {
      if (j2 >= 0) {
        // Switch arpeggio note.
        arp = (arp >> 8) | ((arp & 255) << 4);
        j2 -= arpInterval;

        // Calculate note frequencies for the oscillators
        o1t = getnotefreq(n + (arp & 15) + instr.i[2] - 128);
        o2t =
          getnotefreq(n + (arp & 15) + instr.i[6] - 128) *
          (1 + 0.0008 * instr.i[7]);
      }

      // Envelope
      e = 1;
      if (j < attack) {
        e = j / attack;
      } else if (j >= attack + sustain) {
        e -= (j - attack - sustain) * releaseInv;
      }

      // Oscillator 1
      t = o1t;
      if (o1xenv) {
        t *= e * e;
      }
      c1 += t;
      rsample = osc1(c1) * o1vol;

      // Oscillator 2
      t = o2t;
      if (o2xenv) {
        t *= e * e;
      }
      c2 += t;
      rsample += osc2(c2) * o2vol;

      // Noise oscillator
      if (noiseVol) {
        rsample += (2 * Math.random() - 1) * noiseVol;
      }

      // Add to (mono) channel buffer
      noteBuf[j] = (80 * rsample * e) | 0;
    }

    return noteBuf;
  };

  //--------------------------------------------------------------------------
  // Private members
  //--------------------------------------------------------------------------

  // Array of oscillator functions
  var mOscillators = [osc_sin, osc_square, osc_saw, osc_tri];

  // Private variables set up by init()
  var mSong, mLastRow, mCurrentCol, mNumWords, mMixBuf;

  //--------------------------------------------------------------------------
  // Initialization
  //--------------------------------------------------------------------------

  this.init = function (song) {
    // Define the song
    mSong = song;

    // Init iteration state variables
    mLastRow = song.endPattern;
    mCurrentCol = 0;

    // Prepare song info
    mNumWords = song.rowLen * song.patternLen * (mLastRow + 1) * 2;

    // Create work buffer (initially cleared)
    mMixBuf = new Int32Array(mNumWords);
  };

  //--------------------------------------------------------------------------
  // Public methods
  //--------------------------------------------------------------------------

  // Generate audio data for a single track
  this.generate = function () {
    // Local variables
    var i,
      j,
      b,
      p,
      row,
      col,
      n,
      cp,
      k,
      t,
      lfor,
      e,
      x,
      rsample,
      rowStartSample,
      f,
      da;

    // Put performance critical items in local variables
    var chnBuf = new Int32Array(mNumWords),
      instr = mSong.songData[mCurrentCol],
      rowLen = mSong.rowLen,
      patternLen = mSong.patternLen;

    // Clear effect state
    var low = 0,
      band = 0,
      high;
    var lsample,
      filterActive = false;

    // Clear note cache.
    var noteCache = [];

    // Patterns
    for (p = 0; p <= mLastRow; ++p) {
      cp = instr.p[p];

      // Pattern rows
      for (row = 0; row < patternLen; ++row) {
        // Execute effect command.
        var cmdNo = cp ? instr.c[cp - 1].f[row] : 0;
        if (cmdNo) {
          instr.i[cmdNo - 1] = instr.c[cp - 1].f[row + patternLen] || 0;

          // Clear the note cache since the instrument has changed.
          if (cmdNo < 16) {
            noteCache = [];
          }
        }

        // Put performance critical instrument properties in local variables
        var oscLFO = mOscillators[instr.i[15]],
          lfoAmt = instr.i[16] / 512,
          lfoFreq = Math.pow(2, instr.i[17] - 9) / rowLen,
          fxLFO = instr.i[18],
          fxFilter = instr.i[19],
          fxFreq = (instr.i[20] * 43.23529 * 3.141592) / 44100,
          q = 1 - instr.i[21] / 255,
          dist = instr.i[22] * 1e-5,
          drive = instr.i[23] / 32,
          panAmt = instr.i[24] / 512,
          panFreq = (6.283184 * Math.pow(2, instr.i[25] - 9)) / rowLen,
          dlyAmt = instr.i[26] / 255,
          dly = (instr.i[27] * rowLen) & ~1; // Must be an even number

        // Calculate start sample number for this row in the pattern
        rowStartSample = (p * patternLen + row) * rowLen;

        // Generate notes for this pattern row
        for (col = 0; col < 4; ++col) {
          n = cp ? instr.c[cp - 1].n[row + col * patternLen] : 0;
          if (n) {
            if (!noteCache[n]) {
              noteCache[n] = createNote(instr, n, rowLen);
            }

            // Copy note from the note cache
            var noteBuf = noteCache[n];
            for (
              j = 0, i = rowStartSample * 2;
              j < noteBuf.length;
              j++ , i += 2
            ) {
              chnBuf[i] += noteBuf[j];
            }
          }
        }

        // Perform effects for this pattern row
        for (j = 0; j < rowLen; j++) {
          // Dry mono-sample
          k = (rowStartSample + j) * 2;
          rsample = chnBuf[k];

          // We only do effects if we have some sound input
          if (rsample || filterActive) {
            // State variable filter
            f = fxFreq;
            if (fxLFO) {
              f *= oscLFO(lfoFreq * k) * lfoAmt + 0.5;
            }
            f = 1.5 * Math.sin(f);
            low += f * band;
            high = q * (rsample - band) - low;
            band += f * high;
            rsample = fxFilter == 3 ? band : fxFilter == 1 ? high : low;

            // Distortion
            if (dist) {
              rsample *= dist;
              rsample =
                rsample < 1 ? (rsample > -1 ? osc_sin(rsample * 0.25) : -1) : 1;
              rsample /= dist;
            }

            // Drive
            rsample *= drive;

            // Is the filter active (i.e. still audiable)?
            filterActive = rsample * rsample > 1e-5;

            // Panning
            t = Math.sin(panFreq * k) * panAmt + 0.5;
            lsample = rsample * (1 - t);
            rsample *= t;
          } else {
            lsample = 0;
          }

          // Delay is always done, since it does not need sound input
          if (k >= dly) {
            // Left channel = left + right[-p] * t
            lsample += chnBuf[k - dly + 1] * dlyAmt;

            // Right channel = right + left[-p] * t
            rsample += chnBuf[k - dly] * dlyAmt;
          }

          // Store in stereo channel buffer (needed for the delay effect)
          chnBuf[k] = lsample | 0;
          chnBuf[k + 1] = rsample | 0;

          // ...and add to stereo mix buffer
          mMixBuf[k] += lsample | 0;
          mMixBuf[k + 1] += rsample | 0;
        }
      }
    }

    // Next iteration. Return progress (1.0 == done!).
    mCurrentCol++;
    return mCurrentCol / mSong.numChannels;
  };

  // Create a WAVE formatted Uint8Array from the generated audio data
  this.createWave = function () {
    // Create WAVE header
    var headerLen = 44;
    var l1 = headerLen + mNumWords * 2 - 8;
    var l2 = l1 - 36;
    var wave = new Uint8Array(headerLen + mNumWords * 2);
    wave.set([
      82,
      73,
      70,
      70,
      l1 & 255,
      (l1 >> 8) & 255,
      (l1 >> 16) & 255,
      (l1 >> 24) & 255,
      87,
      65,
      86,
      69,
      102,
      109,
      116,
      32,
      16,
      0,
      0,
      0,
      1,
      0,
      2,
      0,
      68,
      172,
      0,
      0,
      16,
      177,
      2,
      0,
      4,
      0,
      16,
      0,
      100,
      97,
      116,
      97,
      l2 & 255,
      (l2 >> 8) & 255,
      (l2 >> 16) & 255,
      (l2 >> 24) & 255
    ]);

    // Append actual wave data
    for (var i = 0, idx = headerLen; i < mNumWords; ++i) {
      // Note: We clamp here
      var y = mMixBuf[i];
      y = y < -32767 ? -32767 : y > 32767 ? 32767 : y;
      wave[idx++] = y & 255;
      wave[idx++] = (y >> 8) & 255;
    }

    // Return the WAVE formatted typed array
    return wave;
  };

  // Get n samples of wave data at time t [s]. Wave data in range [-2,2].
  this.getData = function (t, n) {
    var i = 2 * Math.floor(t * 44100);
    var d = new Array(n);
    for (var j = 0; j < 2 * n; j += 1) {
      var k = i + j;
      d[j] = t > 0 && k < mMixBuf.length ? mMixBuf[k] / 32768 : 0;
    }
    return d;
  };
};

// This music has been exported by SoundBox. You can use it with
// http://sb.bitsnbites.eu/player-small.js in your own product.

// See http://sb.bitsnbites.eu/demo.html for an example of how to
// use it in a demo.

// Song data
var song = {
  songData: [
    { // Instrument 0
      i: [
        0, // OSC1_WAVEFORM
        100, // OSC1_VOL
        128, // OSC1_SEMI
        0, // OSC1_XENV
        1, // OSC2_WAVEFORM
        201, // OSC2_VOL
        128, // OSC2_SEMI
        0, // OSC2_DETUNE
        0, // OSC2_XENV
        0, // NOISE_VOL
        0, // ENV_ATTACK
        8, // ENV_SUSTAIN
        28, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        0, // LFO_WAVEFORM
        194, // LFO_AMT
        4, // LFO_FREQ
        1, // LFO_FX_FREQ
        3, // FX_FILTER
        25, // FX_FREQ
        191, // FX_RESONANCE
        115, // FX_DIST
        244, // FX_DRIVE
        147, // FX_PAN_AMT
        6, // FX_PAN_FREQ
        43, // FX_DELAY_AMT
        4 // FX_DELAY_TIME
      ],
      // Patterns
      p: [5, 1, 2, 2, 1, 1, 1, 1, 3, 4, 1, 2, 1, 2, 1, 2, , , 7, 7, 7, 7, 7, 7, 7, 7],
      // Columns
      c: [
        {
          n: [132, 132, 134, 134, 135, 135, 132, 132, 137, 137, 135, 135, 134, 134, 135, 135, 139, 139, 137, 137, 135, 135, 137, 137, 134, , 133, , 132, , 131],
          f: [21, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 48]
        },
        {
          n: [132, 132, 134, 134, 135, 135, 132, 132, 137, 137, 135, 135, 134, 134, 135, 135, 139, 139, 137, 137, 135, 135, 137, 137, 139, 139, 135, 135, 134, 134, 130, 130],
          f: [, , , , , , , , , , , , , , , , , , , , , , , , , , , 11, 13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 31]
        },
        {
          n: [],
          f: []
        },
        {
          n: [159, , , , , , , , 158, , , , , , , , 157, , , , , , , , 156, 155, 154, 153, 152, 151, 150, 149],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , 13, , 13, , 13, , 13, 11, 29, , , , , , , , , , , , , , , , , , , , , , , , 32, , 41, , 29, , 25, 15]
        },
        {
          n: [132, 132, 134, 134, 135, 135, 132, 132, 137, 137, 135, 135, 134, 134, 135, 135, 139, 139, 137, 137, 135, 135, 137, 137, 139, 139, 135, 135, 134, 134, 130, 130],
          f: [13, 11, 21, 17, , , , , , , , , , , , , , , , , , , , , , , , , , , , 17, 29, , 25, 113, , , , , , , , , , , , , , , , , , , , , , , , , , , , 194]
        },
        {
          n: [120, , , , , , , , 132, , , , , , , , 120, , , , , , , , 108],
          f: []
        },
        {
          n: [132, 144, 134, 146, 132, 144, 135, 147, 132, 144, 137, 149, 132, 144, 139, 151, 140, 152, 139, 151, 137, 149, 139, 151, 138, 150, 137, 149, 135, 147, 134, 146],
          f: []
        }
      ]
    },
    { // Instrument 1
      i: [
        0, // OSC1_WAVEFORM
        255, // OSC1_VOL
        117, // OSC1_SEMI
        1, // OSC1_XENV
        0, // OSC2_WAVEFORM
        255, // OSC2_VOL
        110, // OSC2_SEMI
        0, // OSC2_DETUNE
        1, // OSC2_XENV
        0, // NOISE_VOL
        4, // ENV_ATTACK
        6, // ENV_SUSTAIN
        35, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        0, // LFO_WAVEFORM
        0, // LFO_AMT
        0, // LFO_FREQ
        0, // LFO_FX_FREQ
        2, // FX_FILTER
        14, // FX_FREQ
        1, // FX_RESONANCE
        1, // FX_DIST
        39, // FX_DRIVE
        76, // FX_PAN_AMT
        5, // FX_PAN_FREQ
        0, // FX_DELAY_AMT
        0 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, , 1, 3, 1, 3, 1, 3, 2, , , , 1, 3, 1, 3, 1, 3, , , 1, 3, 1, 3, 1, 3],
      // Columns
      c: [
        {
          n: [147, , , , , , 147, , , , 147, , , , , , 147, , , , , , 147, , , , 147, , , , 147],
          f: []
        },
        {
          n: [147],
          f: []
        },
        {
          n: [147, , , , , , 147, , , , 147, , , , 147, , 147, , , , , , 147, , , , 147, , , , 147, 147],
          f: []
        }
      ]
    },
    { // Instrument 2
      i: [
        0, // OSC1_WAVEFORM
        0, // OSC1_VOL
        140, // OSC1_SEMI
        0, // OSC1_XENV
        0, // OSC2_WAVEFORM
        0, // OSC2_VOL
        140, // OSC2_SEMI
        0, // OSC2_DETUNE
        0, // OSC2_XENV
        60, // NOISE_VOL
        4, // ENV_ATTACK
        10, // ENV_SUSTAIN
        68, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        0, // LFO_WAVEFORM
        187, // LFO_AMT
        5, // LFO_FREQ
        0, // LFO_FX_FREQ
        1, // FX_FILTER
        239, // FX_FREQ
        135, // FX_RESONANCE
        0, // FX_DIST
        32, // FX_DRIVE
        108, // FX_PAN_AMT
        5, // FX_PAN_FREQ
        16, // FX_DELAY_AMT
        4 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, , 1, 1, 2, 3, 2, 3, 4, , , , 2, 3, 2, 3, 2, 3, , , 5, 5, 5, 5, 5, 5],
      // Columns
      c: [
        {
          n: [, , , , 147, , , , , , , , 148, , , , , , , , 147, , , , , , , , 147],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 35]
        },
        {
          n: [, , , , 147, , , 147, , , , , 148, , , , , , , , 147, , , 147, , , 147, , , , 147],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 35]
        },
        {
          n: [, , , , 147, , , 147, , , , , 148, , , , , , , , 147, , , 147, , , 147, , , 147, 147, 147],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 35]
        },
        {
          n: [147],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 68]
        },
        {
          n: [147, , , 147, , , 147, , 147, , , 147, , 147, , 147, 147, , , 147, , , 147, , 147, , , 147, , 147, , 147],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 35]
        }
      ]
    },
    { // Instrument 3
      i: [
        2, // OSC1_WAVEFORM
        192, // OSC1_VOL
        128, // OSC1_SEMI
        0, // OSC1_XENV
        2, // OSC2_WAVEFORM
        192, // OSC2_VOL
        140, // OSC2_SEMI
        18, // OSC2_DETUNE
        0, // OSC2_XENV
        0, // NOISE_VOL
        107, // ENV_ATTACK
        115, // ENV_SUSTAIN
        138, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        0, // LFO_WAVEFORM
        136, // LFO_AMT
        5, // LFO_FREQ
        1, // LFO_FX_FREQ
        2, // FX_FILTER
        8, // FX_FREQ
        93, // FX_RESONANCE
        22, // FX_DIST
        56, // FX_DRIVE
        148, // FX_PAN_AMT
        5, // FX_PAN_FREQ
        85, // FX_DELAY_AMT
        8 // FX_DELAY_TIME
      ],
      // Patterns
      p: [3, , 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
      // Columns
      c: [
        {
          n: [120],
          f: []
        },
        {
          n: [120],
          f: []
        },
        {
          n: [120],
          f: [, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 24, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 56]
        }
      ]
    },
    { // Instrument 4
      i: [
        3, // OSC1_WAVEFORM
        0, // OSC1_VOL
        127, // OSC1_SEMI
        0, // OSC1_XENV
        3, // OSC2_WAVEFORM
        68, // OSC2_VOL
        127, // OSC2_SEMI
        0, // OSC2_DETUNE
        1, // OSC2_XENV
        218, // NOISE_VOL
        11, // ENV_ATTACK
        0, // ENV_SUSTAIN
        40, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        1, // LFO_WAVEFORM
        55, // LFO_AMT
        4, // LFO_FREQ
        1, // LFO_FX_FREQ
        2, // FX_FILTER
        67, // FX_FREQ
        115, // FX_RESONANCE
        124, // FX_DIST
        190, // FX_DRIVE
        67, // FX_PAN_AMT
        6, // FX_PAN_FREQ
        39, // FX_DELAY_AMT
        1 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, , , 2, 1, 2, 1, 2, 3, , , , 1, 2, 1, 2, 1, 2, , , 1, 4, 1, 4, 1, 4],
      // Columns
      c: [
        {
          n: [, , , , 147, , , , , , , , 147, , , , , , , , 147, , , , , , , , 147],
          f: []
        },
        {
          n: [, , , , 147, , , , , , 147, , 147, , , , , , , , 147, , , , , , , , 147],
          f: []
        },
        {
          n: [147],
          f: []
        },
        {
          n: [, , , , 147, , , , , , , , 147, , , , , , , , 147, , , , , , , , 147, , , 147],
          f: []
        }
      ]
    },
    { // Instrument 5
      i: [
        3, // OSC1_WAVEFORM
        91, // OSC1_VOL
        128, // OSC1_SEMI
        0, // OSC1_XENV
        0, // OSC2_WAVEFORM
        95, // OSC2_VOL
        128, // OSC2_SEMI
        12, // OSC2_DETUNE
        0, // OSC2_XENV
        0, // NOISE_VOL
        12, // ENV_ATTACK
        0, // ENV_SUSTAIN
        67, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        0, // LFO_WAVEFORM
        0, // LFO_AMT
        0, // LFO_FREQ
        0, // LFO_FX_FREQ
        2, // FX_FILTER
        255, // FX_FREQ
        15, // FX_RESONANCE
        0, // FX_DIST
        32, // FX_DRIVE
        83, // FX_PAN_AMT
        3, // FX_PAN_FREQ
        51, // FX_DELAY_AMT
        4 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, , , , 1, 2, 1, 2, 1, 2, , , 1, 2, 3, 2, 1, 2, , , , , 5, 4, 5, 4],
      // Columns
      c: [
        {
          n: [156, , , 164, , , 163, , 161, , , , , , , , , , 158, , 159, , 161, , 159, , 158, , 159, , 154, , 159],
          f: [5, 13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 67]
        },
        {
          n: [144, , , 147, , , 149, , 151, , , , , , , , , , 149, , 151, , 152, , 151, , 151, , 147, , 147, , 139],
          f: []
        },
        {
          n: [156, , , 156, , , 156, , 154, , , 154, , , 154, , 152, , , 152, , , 152, , 151, , , 147, , , 146, , , , 151, , , 151, , 151, , , 146, , , 146, , 146, , , 144, , , 144, , 144, , , 142, , , 139, , 137],
          f: [5, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 3]
        },
        {
          n: [163, , 164, , 166, , 163, , 163, , 164, , 166, , 163, , 163, , 164, , 166, , 163, , 163, , 164, , 166, , 163],
          f: [13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 25]
        },
        {
          n: [168, , 170, , 171, , 168, , 168, , 170, , 171, , 168, , 159, , 159, , 158, , 158, , 157, , 157, , 156, , 156],
          f: [, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 67]
        }
      ]
    },
    { // Instrument 6
      i: [
        0, // OSC1_WAVEFORM
        146, // OSC1_VOL
        140, // OSC1_SEMI
        0, // OSC1_XENV
        1, // OSC2_WAVEFORM
        224, // OSC2_VOL
        128, // OSC2_SEMI
        3, // OSC2_DETUNE
        0, // OSC2_XENV
        0, // NOISE_VOL
        61, // ENV_ATTACK
        0, // ENV_SUSTAIN
        63, // ENV_RELEASE
        0, // ARP_CHORD
        0, // ARP_SPEED
        3, // LFO_WAVEFORM
        179, // LFO_AMT
        5, // LFO_FREQ
        1, // LFO_FX_FREQ
        3, // FX_FILTER
        37, // FX_FREQ
        162, // FX_RESONANCE
        0, // FX_DIST
        67, // FX_DRIVE
        150, // FX_PAN_AMT
        3, // FX_PAN_FREQ
        37, // FX_DELAY_AMT
        2 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, 1, , , , , , , , , 1, 2, 3, , 1, 2, 1, 2, 3, , 4, 5],
      // Columns
      c: [
        {
          n: [, , , , , , , , , , , , , , , , , , , , , , , , 122, , 121, , 120, , 119],
          f: []
        },
        {
          n: [, , , , , , , , , , , , 110, 109, , , , , , , , , , , , , , , 132, 144, 120, 108],
          f: [11, , , , , , , , , , , , , , , , , , , , , , , , , , , , 11, , , , 95, , , , , , , , , , , , , , , , , , , , , , , , , , , , 29]
        },
        {
          n: [123],
          f: [24, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 24, 52, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 67]
        },
        {
          n: [120, , , , , , 120, , 120, , , , , , , , , , , , , , , , , , , , , , , , 123, , , , , , 123, , 123, , , , , , , , , , , , , , , , , , , , , , , , 125, , , , , , 125, , 125],
          f: [11, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 95]
        },
        {
          n: [120, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 123, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 125],
          f: []
        }
      ]
    },
    { // Instrument 7
      i: [
        2, // OSC1_WAVEFORM
        138, // OSC1_VOL
        116, // OSC1_SEMI
        0, // OSC1_XENV
        2, // OSC2_WAVEFORM
        138, // OSC2_VOL
        128, // OSC2_SEMI
        4, // OSC2_DETUNE
        0, // OSC2_XENV
        0, // NOISE_VOL
        47, // ENV_ATTACK
        48, // ENV_SUSTAIN
        107, // ENV_RELEASE
        124, // ARP_CHORD
        3, // ARP_SPEED
        0, // LFO_WAVEFORM
        139, // LFO_AMT
        4, // LFO_FREQ
        1, // LFO_FX_FREQ
        3, // FX_FILTER
        64, // FX_FREQ
        160, // FX_RESONANCE
        3, // FX_DIST
        32, // FX_DRIVE
        147, // FX_PAN_AMT
        4, // FX_PAN_FREQ
        121, // FX_DELAY_AMT
        5 // FX_DELAY_TIME
      ],
      // Patterns
      p: [, , , , , , , , 1, , , , , , , , , , 1],
      // Columns
      c: [
        {
          n: [156, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 168],
          f: []
        }
      ]
    },
  ],
  rowLen: 5513,   // In sample lengths
  patternLen: 32,  // Rows per pattern
  endPattern: 25,  // End pattern
  numChannels: 8  // Number of channels
};

let player = new Soundbox();
player.init(song);

// Initialize music generation (player).
player.init(song);

// Generate music...
let done = false;
setInterval(function () {
  if (done) {
    return;
  }

  done = player.generate() >= 1;

  if (done) {
    // Put the generated song in an Audio element.
    let wave = player.createWave();
    postMessage(wave);
  }
}, 10);