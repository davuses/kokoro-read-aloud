import asyncio
import os
import pathlib
import re
import subprocess

import soundfile as sf
from kokoro import KPipeline
from telegram.ext import Application
from tqdm import tqdm

pipeline = KPipeline(lang_code="a")  # make sure lang_code matches voice
for wav_file in pathlib.Path("audio_output").glob("*.wav"):
    wav_file.unlink()

text = open("text.txt").read()
generator = pipeline(text, voice="am_echo", speed=1, split_pattern=r"\n+")


os.makedirs("./audio_output", exist_ok=True)

for i, (gs, ps, audio) in tqdm(enumerate(generator)):
    sf.write(f"audio_output/{i}.wav", audio, 24000)  # save each audio file


def get_safe_filename(filepath, length=30):
    with open(filepath, "r", encoding="utf-8") as file:
        text = file.read(length)
    return re.sub(r"[^\w ]", "", text)  # Keep alphanumeric and spaces


def create_ffmpeg_concat():
    audio_files = sorted(
        pathlib.Path("audio_output").glob("*.wav"), key=lambda f: int(f.stem)
    )

    file_list = "".join(f"file '{f.resolve()}'\n" for f in audio_files)
    list_path = "file_list.txt"

    with open(list_path, "w", encoding="utf-8") as f:
        f.write(file_list)

    return list_path


def convert_audio(filename):
    file_list = create_ffmpeg_concat()

    command = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        file_list,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        filename,
    ]

    subprocess.run(
        command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )


filename = get_safe_filename("text.txt") + "..more.mp3"

convert_audio(filename)


token = "5574880608:AAG47ibkroWi0ysLvSoRllmZ0Q9kTpvxBww"


async def send_file_async(token, filename, chat_id=5510458637):
    application = Application.builder().token(token).build()
    path = filename

    print(f"sending file..., path is {path}")

    async with application:
        with open(path, "rb") as file:
            await application.bot.send_document(
                document=file,
                chat_id=chat_id,
                disable_notification=True,
            )


asyncio.run(send_file_async(token=token, filename=filename))
