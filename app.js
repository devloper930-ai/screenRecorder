import {
  FFmpeg
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/+esm";

import {
  fetchFile,
  toBlobURL
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/+esm";


const $ = id => document.getElementById(id);


const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const stopBtn = $("stopBtn");
const downloadBtn = $("downloadBtn");
const resetBtn = $("resetBtn");

const previewVideo = $("previewVideo");
const emptyState = $("emptyState");

const timerEl = $("timer");
const sizeInfo = $("sizeInfo");
const recordingStatus = $("recordingStatus");

const status = $("status");
const statusText = $("statusText");

const recordingBadge =
  $("recordingBadge");

const message =
  $("message");

const micToggle =
  $("micToggle");

const systemAudioToggle =
  $("systemAudioToggle");

const quality =
  $("quality");


const conversionPanel =
  $("conversionPanel");

const conversionTitle =
  $("conversionTitle");

const conversionText =
  $("conversionText");

const conversionPercent =
  $("conversionPercent");

const progressBar =
  $("progressBar");


let displayStream = null;
let micStream = null;
let combinedStream = null;

let mediaRecorder = null;

let recordedChunks = [];

let recordedBlob = null;
let mp4Blob = null;

let previewUrl = null;

let startTime = 0;
let pausedTime = 0;
let pauseStarted = 0;

let timerInterval = null;

let ffmpeg = null;
let ffmpegLoaded = false;

let converting = false;


/* ================================
   TOAST
================================ */

function toast(
  text,
  type = ""
){

  message.textContent = text;

  message.className =
    `toast show ${type}`;

  clearTimeout(toast.t);

  toast.t =
    setTimeout(() => {

      message.className =
        "toast";

    },3200);

}


/* ================================
   TIMER
================================ */

function fmt(sec){

  const h =
    Math.floor(sec / 3600);

  const m =
    Math.floor(
      (sec % 3600) / 60
    );

  const s =
    Math.floor(sec % 60);


  return [
    h,
    m,
    s

  ]
  .map(
    v =>
      String(v)
      .padStart(2,"0")
  )
  .join(":");

}


function updateTimer(){

  if(!startTime)
    return;


  let elapsed =
    Date.now()
    - startTime
    - pausedTime;


  if(
    mediaRecorder &&
    mediaRecorder.state === "paused"
  ){

    elapsed -=
      Date.now()
      - pauseStarted;

  }


  timerEl.textContent =
    fmt(
      Math.max(
        0,
        Math.floor(
          elapsed / 1000
        )
      )
    );

}


function startTimer(){

  startTime =
    Date.now();

  pausedTime = 0;
  pauseStarted = 0;

  clearInterval(
    timerInterval
  );

  timerInterval =
    setInterval(
      updateTimer,
      250
    );

  updateTimer();

}


function stopTimer(){

  clearInterval(
    timerInterval
  );

  timerInterval = null;

}


/* ================================
   SIZE
================================ */

function updateSize(){

  const bytes =
    recordedChunks.reduce(
      (n,c) =>
        n + c.size,
      0
    );


  const mb =
    bytes / 1048576;


  sizeInfo.textContent =
    mb < 1

      ? `${mb.toFixed(2)} MB`

      : `${mb.toFixed(1)} MB`;

}


/* ================================
   LOCK SETTINGS
================================ */

function lockSettings(value){

  micToggle.disabled =
    value;

  systemAudioToggle.disabled =
    value;

  quality.disabled =
    value;

}


/* ================================
   CLEANUP
================================ */

function cleanup(){

  displayStream
    ?.getTracks()
    .forEach(
      track =>
        track.stop()
    );


  micStream
    ?.getTracks()
    .forEach(
      track =>
        track.stop()
    );


  displayStream = null;
  micStream = null;
  combinedStream = null;

}


/* ================================
   MICROPHONE
================================ */

async function getMic(){

  if(!micToggle.checked)
    return null;


  try{

    return await
      navigator
      .mediaDevices
      .getUserMedia({

        audio:{
          echoCancellation:true,
          noiseSuppression:true,
          autoGainControl:true
        }

      });

  }

  catch(error){

    toast(
      "Microphone permission was denied.",
      "error"
    );

    throw error;

  }

}


/* ================================
   START RECORDING
================================ */

async function startRecording(){

  if(
    !navigator
      .mediaDevices
      ?.getDisplayMedia
  ){

    toast(
      "Screen recording is not supported.",
      "error"
    );

    return;

  }


  if(!window.MediaRecorder){

    toast(
      "MediaRecorder is not supported.",
      "error"
    );

    return;

  }


  try{

    startBtn.disabled =
      true;

    startBtn.textContent =
      "Requesting permission…";

    lockSettings(true);


    /*
      SCREEN CAPTURE
    */

    displayStream =
      await navigator
      .mediaDevices
      .getDisplayMedia({

        video:{
          frameRate:{
            ideal:30,
            max:60
          }
        },

        audio:
          systemAudioToggle.checked

      });


    /*
      MICROPHONE
    */

    micStream =
      await getMic();


    /*
      COMBINE TRACKS
    */

    const tracks = [

      ...displayStream
        .getVideoTracks()

    ];


    displayStream
      .getAudioTracks()
      .forEach(
        track =>
          tracks.push(track)
      );


    micStream
      ?.getAudioTracks()
      .forEach(
        track =>
          tracks.push(track)
      );


    combinedStream =
      new MediaStream(
        tracks
      );


    /*
      PREVIEW
    */

    previewVideo.srcObject =
      combinedStream;

    previewVideo.controls =
      false;

    previewVideo.muted =
      true;

    previewVideo.style.display =
      "block";

    emptyState.style.display =
      "none";


    await previewVideo.play();


    /*
      MIME TYPE
    */

    const types = [

      "video/webm;codecs=vp9,opus",

      "video/webm;codecs=vp8,opus",

      "video/webm"

    ];


    const mime =
      types.find(
        type =>
          MediaRecorder
          .isTypeSupported(type)
      ) || "";


    /*
      MEDIA RECORDER
    */

    mediaRecorder =
      new MediaRecorder(

        combinedStream,

        {

          ...(mime
            ? {mimeType:mime}
            : {}),

          videoBitsPerSecond:
            Number(
              quality.value
            )

        }

      );


    recordedChunks = [];

    recordedBlob = null;

    mp4Blob = null;


    mediaRecorder
      .ondataavailable =
      event => {

        if(
          event.data &&
          event.data.size
        ){

          recordedChunks.push(
            event.data
          );

          updateSize();

        }

      };


    mediaRecorder.onstop =
      finishRecording;


    mediaRecorder.onerror =
      () => {

        toast(
          "Recording error occurred.",
          "error"
        );

      };


    /*
      DETECT STOP SHARE
    */

    const videoTrack =
      displayStream
      .getVideoTracks()[0];


    if(videoTrack){

      videoTrack.onended =
        () => {

          if(
            mediaRecorder &&
            mediaRecorder.state !==
              "inactive"
          ){

            stopRecording();

          }

        };

    }


    /*
      START
    */

    mediaRecorder.start(1000);

    startTimer();


    status.classList.add(
      "recording"
    );

    statusText.textContent =
      "Recording";


    recordingBadge.style.display =
      "block";


    recordingStatus.textContent =
      "Recording in progress";


    pauseBtn.disabled =
      false;

    stopBtn.disabled =
      false;

    downloadBtn.disabled =
      true;


    startBtn.textContent =
      "● Recording";


    toast(
      "Recording started.",
      "success"
    );

  }

  catch(error){

    console.error(error);

    cleanup();

    lockSettings(false);

    startBtn.disabled =
      false;

    startBtn.textContent =
      "● Start Recording";

    pauseBtn.disabled =
      true;

    stopBtn.disabled =
      true;


    if(
      error.name ===
        "NotAllowedError"
      ||
      error.name ===
        "AbortError"
    ){

      toast(
        "Screen selection was cancelled.",
        "error"
      );

    }

    else{

      toast(
        "Could not start recording.",
        "error"
      );

    }

  }

}


/* ================================
   PAUSE / RESUME
================================ */

function togglePause(){

  if(!mediaRecorder)
    return;


  if(
    mediaRecorder.state ===
      "recording"
  ){

    mediaRecorder.pause();

    pauseStarted =
      Date.now();


    pauseBtn.innerHTML =
      "<span>▶</span> Resume";


    recordingStatus.textContent =
      "Recording paused";


    statusText.textContent =
      "Paused";

  }


  else if(
    mediaRecorder.state ===
      "paused"
  ){

    pausedTime +=
      Date.now()
      - pauseStarted;


    pauseStarted = 0;


    mediaRecorder.resume();


    pauseBtn.innerHTML =
      "<span>Ⅱ</span> Pause";


    recordingStatus.textContent =
      "Recording in progress";


    statusText.textContent =
      "Recording";

  }

}


/* ================================
   STOP
================================ */

function stopRecording(){

  if(!mediaRecorder)
    return;


  if(
    mediaRecorder.state ===
      "recording"
    ||
    mediaRecorder.state ===
      "paused"
  ){

    mediaRecorder.stop();

  }


  stopTimer();


  pauseBtn.disabled =
    true;

  stopBtn.disabled =
    true;


  recordingStatus.textContent =
    "Processing recording…";

}


/* ================================
   FINISH RECORDING
================================ */

function finishRecording(){

  recordedBlob =
    new Blob(

      recordedChunks,

      {
        type:
          mediaRecorder?.mimeType
          ||
          "video/webm"
      }

    );


  updateSize();

  cleanup();


  if(previewUrl){

    URL.revokeObjectURL(
      previewUrl
    );

  }


  previewUrl =
    URL.createObjectURL(
      recordedBlob
    );


  previewVideo.srcObject =
    null;

  previewVideo.src =
    previewUrl;

  previewVideo.controls =
    true;

  previewVideo.muted =
    false;

  previewVideo.style.display =
    "block";


  emptyState.style.display =
    "none";


  status.classList.remove(
    "recording"
  );

  statusText.textContent =
    "Ready";


  recordingBadge.style.display =
    "none";


  recordingStatus.textContent =
    "Recording ready";


  startBtn.disabled =
    false;

  startBtn.textContent =
    "● Start Recording";


  lockSettings(false);


  mediaRecorder = null;


  /*
    START MP4 CONVERSION
  */

  convertToMp4();

}


/* ================================
   PROGRESS
================================ */

function setProgress(
  percent,
  title,
  text
){

  conversionPercent.textContent =
    `${Math.round(percent)}%`;


  progressBar.style.width =
    `${Math.max(
      0,
      Math.min(
        100,
        percent
      )
    )}%`;


  if(title)
    conversionTitle.textContent =
      title;


  if(text)
    conversionText.textContent =
      text;

}


/* ================================
   LOAD FFMPEG
================================ */

async function loadFFmpeg(){

  if(ffmpegLoaded)
    return;


  if(!ffmpeg)
    ffmpeg =
      new FFmpeg();


  ffmpeg.on(
    "progress",
    ({progress}) => {

      setProgress(

        progress * 100,

        "Converting to MP4…",

        "Encoding your recording locally on this device."

      );

    }
  );


  const base =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";


  setProgress(
    3,
    "Loading MP4 converter…",
    "The converter is downloaded once and then cached by the browser."
  );


  await ffmpeg.load({

    coreURL:
      await toBlobURL(
        `${base}/ffmpeg-core.js`,
        "text/javascript"
      ),

    wasmURL:
      await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm"
      )

  });


  ffmpegLoaded = true;

}


/* ================================
   CONVERT WEBM → MP4
================================ */

async function convertToMp4(){

  if(
    !recordedBlob ||
    converting
  ){

    return;

  }


  converting = true;


  conversionPanel.hidden =
    false;


  downloadBtn.disabled =
    true;


  try{

    await loadFFmpeg();


    setProgress(
      8,
      "Preparing MP4…",
      "Writing the recording to the local converter."
    );


    await ffmpeg.writeFile(
      "input.webm",
      await fetchFile(
        recordedBlob
      )
    );


    /*
      H264 VIDEO
      AAC AUDIO
      FAST START
    */

    await ffmpeg.exec([

      "-i",
      "input.webm",

      "-c:v",
      "libx264",

      "-preset",
      "veryfast",

      "-crf",
      "23",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-movflags",
      "+faststart",

      "output.mp4"

    ]);


    const data =
      await ffmpeg.readFile(
        "output.mp4"
      );


    mp4Blob =
      new Blob(

        [data.buffer],

        {
          type:
            "video/mp4"
        }

      );


    setProgress(
      100,
      "MP4 ready",
      "Your file is ready to download and upload anywhere."
    );


    recordingStatus.textContent =
      "MP4 ready";


    downloadBtn.disabled =
      false;


    toast(
      "MP4 conversion completed.",
      "success"
    );


    try{

      await ffmpeg.deleteFile(
        "input.webm"
      );

      await ffmpeg.deleteFile(
        "output.mp4"
      );

    }

    catch{}

  }


  catch(error){

    console.error(error);


    conversionTitle.textContent =
      "MP4 conversion failed";


    conversionText.textContent =
      "The browser could not run the local converter. The WebM recording is still available.";


    toast(
      "MP4 conversion failed. WebM is still available.",
      "error"
    );


    /*
      FALLBACK
    */

    mp4Blob = null;

    downloadBtn.disabled =
      false;


    downloadBtn.innerHTML =
      "<span>↓</span> Download WebM";

  }


  finally{

    converting = false;

  }

}


/* ================================
   DOWNLOAD
================================ */

function downloadRecording(){

  const blob =
    mp4Blob ||
    recordedBlob;


  if(!blob){

    toast(
      "No recording available.",
      "error"
    );

    return;

  }


  const ext =
    mp4Blob
      ? "mp4"
      : "webm";


  const stamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      )
      .slice(
        0,
        19
      );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href = url;


  a.download =
    `screen-recording-${stamp}.${ext}`;


  document.body.appendChild(a);

  a.click();

  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );


  toast(
    `Recording downloaded as ${ext.toUpperCase()}.`,
    "success"
  );

}


/* ================================
   RESET
================================ */

function resetRecorder(){

  if(
    mediaRecorder &&
    mediaRecorder.state !==
      "inactive"
  ){

    mediaRecorder.stop();

  }


  cleanup();

  stopTimer();


  if(previewUrl){

    URL.revokeObjectURL(
      previewUrl
    );

  }


  previewUrl = null;


  recordedChunks = [];

  recordedBlob = null;

  mp4Blob = null;

  mediaRecorder = null;


  previewVideo.src =
    "";

  previewVideo.srcObject =
    null;

  previewVideo.controls =
    false;

  previewVideo.muted =
    true;

  previewVideo.style.display =
    "none";


  emptyState.style.display =
    "block";


  timerEl.textContent =
    "00:00:00";


  sizeInfo.textContent =
    "0 MB";


  recordingStatus.textContent =
    "No recording";


  status.classList.remove(
    "recording"
  );


  statusText.textContent =
    "Ready";


  recordingBadge.style.display =
    "none";


  startBtn.disabled =
    false;


  pauseBtn.disabled =
    true;


  stopBtn.disabled =
    true;


  downloadBtn.disabled =
    true;


  downloadBtn.innerHTML =
    "<span>↓</span> Download MP4";


  startBtn.textContent =
    "● Start Recording";


  pauseBtn.innerHTML =
    "<span>Ⅱ</span> Pause";


  lockSettings(false);


  conversionPanel.hidden =
    true;


  setProgress(0);


  toast(
    "Recorder reset."
  );

}


/* ================================
   EVENTS
================================ */

startBtn.addEventListener(
  "click",
  startRecording
);


pauseBtn.addEventListener(
  "click",
  togglePause
);


stopBtn.addEventListener(
  "click",
  stopRecording
);


downloadBtn.addEventListener(
  "click",
  downloadRecording
);


resetBtn.addEventListener(
  "click",
  resetRecorder
);


/* ================================
   BROWSER CHECK
================================ */

if(
  !navigator.mediaDevices
    ?.getDisplayMedia
  ||
  !window.MediaRecorder
){

  startBtn.disabled =
    true;

  toast(
    "Use a modern Chrome or Edge browser for screen recording.",
    "error"
  );

}
