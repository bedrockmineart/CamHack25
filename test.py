import os, threading
import tkinter as tk
from tkinter import filedialog
import numpy as np
import torch
import torch.nn as nn
import librosa
from scipy.signal import find_peaks
import PIL.Image

import google.generativeai as genai

genai.configure(api_key='AIzaSyD7sqP9R-_GtQeDYHpKUniAToSK-ON5rjQ')

model = genai.GenerativeModel('gemini-2.0-flash-lite')

# ========================
# PARAMETERS
# ========================
SR = 22050*2
FIXED_LEN = 0.30
N_MELS = 80
N_FFT = 1024
HOP = 256
MAX_T = 31

# Default normalization values
MEAN = np.array([-18.690125, -17.937227, -20.178814, -21.39577, -22.90489, -25.344667,
                 -25.200706, -25.870438, -27.667503, -28.248032, -28.61455, -30.366795,
                 -31.553476, -31.471077, -32.494427, -32.407806, -32.144608, -31.928093,
                 -31.255938, -30.092798, -29.93129, -30.652029, -30.987606, -30.183636,
                 -30.418541, -30.479534, -31.047739, -30.846657, -31.056345, -31.67745,
                 -32.05866, -31.589922, -31.438263, -31.73294, -31.044409, -29.947796,
                 -29.480114, -28.986467, -30.146425, -31.518671, -32.131927, -32.377476,
                 -33.22641, -33.784355, -34.610077, -35.391735, -35.672245, -36.18823,
                 -36.758812, -37.637493, -38.119488, -38.915016, -39.976055, -40.84624,
                 -40.925423, -40.965954, -40.944855, -41.161293, -41.926453, -42.55703,
                 -44.026775, -46.215824, -48.264957, -49.8878, -52.491528, -55.351982,
                 -55.84319, -54.535446, -53.178654, -54.9578, -57.909946, -57.405613,
                 -55.86575, -57.71442, -65.29873, -76.92206, -77.136894, -77.17928,
                 -77.197235, -77.20928])
STD = np.array([8.576318, 8.854839, 9.39697, 9.527076, 9.6370125, 10.0065975,
                10.705423, 11.350877, 11.297618, 11.208822, 11.187727, 10.835598,
                10.80825, 11.088621, 11.144277, 11.315839, 11.448063, 11.587413,
                11.595148, 11.569159, 11.566742, 11.504058, 11.419408, 11.599466,
                11.915029, 11.717062, 11.623136, 11.726322, 11.675442, 11.525686,
                11.5016, 11.787873, 11.7547865, 11.569471, 11.843251, 12.251474,
                12.446213, 12.53736, 12.386773, 12.181224, 12.060491, 12.234913,
                12.169081, 11.926555, 11.784956, 11.570252, 11.6612015, 11.683452,
                11.707088, 11.828493, 11.858997, 11.687013, 11.532765, 11.553801,
                11.899452, 11.845104, 11.779862, 11.907657, 11.796166, 12.009947,
                12.4514675, 12.708061, 12.993721, 13.408402, 13.652015, 13.597028,
                13.0132675, 12.87739, 13.1525755, 13.158555, 13.388524, 13.573122,
                13.909223, 14.273433, 13.754259, 10.92386, 10.819994, 10.760114,
                10.717187, 10.690204])

DEFAULT_LABELS = np.array(['a','b','back','c','caps','d','e','enter','f','g','h','i','j','k','l','m','n','o','p','q','r','s','space','t','u','v','w','x','y','z'])

# Model
class KeyCNN(nn.Module):
    def __init__(self, num_classes, n_mels, max_T, dropout=0.3):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1,16,3,padding=1), nn.BatchNorm2d(16), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(16,32,3,padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),
            nn.Conv2d(32,64,3,padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2)
        )
        with torch.no_grad():
            dummy = torch.zeros(1,1,n_mels,max_T)
            feat_dim = self.features(dummy).numel()
        self.classifier = nn.Sequential(nn.Flatten(), nn.Linear(feat_dim,256), nn.ReLU(), nn.Dropout(dropout), nn.Linear(256,128), nn.ReLU(), nn.Dropout(dropout), nn.Linear(128,num_classes))
    def forward(self,x):
        x = self.features(x)
        x = self.classifier(x)
        return x

# Helper functions

def segment_fixed(y,sr, fixed_len=FIXED_LEN):
    fixed_samples=int(fixed_len*sr)
    energy=np.square(y)
    peaks,_=find_peaks(energy,height=np.mean(energy)+0.5*np.std(energy),distance=int(0.8*fixed_samples))
    segments=[]
    for start in peaks[:-1]:
        end=start+fixed_samples
        if end>len(y): seg=np.zeros(fixed_samples); seg[:len(y)-start]=y[start:]
        else: seg=y[start:end]
        segments.append(seg)
    return segments

def preprocess_single_segment(segment, sr=SR, max_T=MAX_T):
    mel = librosa.feature.melspectrogram(y=segment, sr=sr, n_mels=N_MELS, n_fft=N_FFT, hop_length=HOP)
    logmel = librosa.power_to_db(mel, ref=np.max)
    if logmel.shape[1]<max_T: logmel=np.pad(logmel,((0,0),(0,max_T-logmel.shape[1])))
    elif logmel.shape[1]>max_T: logmel=logmel[:,:max_T]
    X=torch.tensor(logmel,dtype=torch.float32).unsqueeze(0).unsqueeze(0)
    # Apply normalization
    mean_t=torch.tensor(MEAN,dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
    std_t=torch.tensor(STD,dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
    X=(X-mean_t)/std_t
    return X

# GUI
class App:
    def __init__(self, root):
        self.root=root
        root.title("Keystroke Recognizer")
        root.configure(bg='#2e2e2e')
        frm=tk.Frame(root,bg='#2e2e2e',padx=10,pady=10); frm.pack(fill=tk.BOTH,expand=True)
        self.file_var=tk.StringVar()
        tk.Label(frm,text="Audio File:",fg='white',bg='#2e2e2e').pack(anchor='w')
        tk.Entry(frm,textvariable=self.file_var,width=60,bg='#3c3c3c',fg='white').pack(side=tk.LEFT,padx=5)
        tk.Button(frm,text="Browse",command=self.browse_file,bg='#555555',fg='white').pack(side=tk.LEFT)
        self.model_var=tk.StringVar(value='CamHack25Model.pth')
        tk.Label(frm,text="Model File:",fg='white',bg='#2e2e2e').pack(anchor='w')
        tk.Entry(frm,textvariable=self.model_var,width=60,bg='#3c3c3c',fg='white').pack(side=tk.LEFT,padx=5)
        tk.Button(frm,text="Browse",command=self.browse_model,bg='#555555',fg='white').pack(side=tk.LEFT)
        tk.Button(frm,text="Run Inference",command=self.run_inference,bg='#007acc',fg='white').pack(pady=10)
        self.output=tk.Text(frm,height=20,bg='#3c3c3c',fg='white'); self.output.pack(fill=tk.BOTH,expand=True)
        self.model=None
        self.device='cuda' if torch.cuda.is_available() else 'cpu'

    def browse_file(self):
        path=filedialog.askopenfilename(filetypes=[("Audio files","*.m4a *.wav *.mp3 *.flac")])
        if path:self.file_var.set(path)

    def browse_model(self):
        path=filedialog.askopenfilename(filetypes=[("PyTorch model","*.pth *.pt")])
        if path:self.model_var.set(path)

    def run_inference(self):
        audio_path=self.file_var.get();
        model_path=self.model_var.get()
        if not os.path.exists(audio_path) or not os.path.exists(model_path):
            self.output.insert(tk.END,"Invalid file or model path\n");
            return
        self.output.insert(tk.END,"Loading model...\n")
        self.model=KeyCNN(num_classes=len(DEFAULT_LABELS), n_mels=N_MELS, max_T=MAX_T, dropout=0)
        checkpoint=torch.load(model_path,map_location=self.device,weights_only=False)
        if 'model_state' in checkpoint:
            self.model.load_state_dict(checkpoint['model_state'])
        else:
            self.model.load_state_dict(checkpoint)
        self.model.to(self.device).eval(); self.output.insert(tk.END,"Model loaded.\n")
        y, sr=librosa.load(audio_path,sr=SR)
        segments=segment_fixed(y,sr)
        self.output.insert(tk.END,f"Detected {len(segments)} segments\n")
        output_sequence = []
        isCap = False
        for seg in segments:
            X=preprocess_single_segment(seg).to(self.device)
            with torch.no_grad():
                pred_idx=int(self.model(X).argmax(1).item());
                label = DEFAULT_LABELS[pred_idx]
                if label == "space":
                    output_sequence.append(' ')
                elif label == "back":
                    if output_sequence:
                        output_sequence.pop()
                elif label == "caps":
                    isCap = not isCap
                elif label == 'enter':
                    output_sequence.append('\n')
                else:
                    output_sequence.append(label.upper() if isCap else label)
        s = ""
        for seq in output_sequence:
            s += seq
       
        response = model.generate_content(f"You are an expert text analyzer. We have been given three strings which all have slight errors from the original. Your task is to analyze a message and decipher what the original text was. Consider grammatical errors. All errors are character changes, no characters are missed or added. The text may contain names. DO NOT OUTPUT ANYTHING OTHER THAN THE CORRECTED STRING. DONT ADD PUNCTUATION. Here is the corrupt message: {s}")
        for c in response.text:
            self.output.insert(tk.END, c)
        self.output.insert(tk.END,"\n")

if __name__=='__main__':
    root=tk.Tk(); app=App(root); root.mainloop()
