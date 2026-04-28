"use client";

import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { kml } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";
import shpwrite from "shp-write";
import * as shapefile from "shapefile";
import tokml from "tokml";

interface FileItem {
  file: File;
  status: "pending" | "processing" | "done" | "error";
}

export default function NeoBrutalistConverter() {
  const [mode, setMode] = useState<"kmz2shp" | "shp2kmz">("kmz2shp");
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const addFiles = (files: File[]) => {
    const newFiles = files.map(f => ({ file: f, status: "pending" as const }));
    setFileList(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFileList(prev => prev.filter((_, i) => i !== index));
  };

  const processBatch = async () => {
    for (let i = 0; i < fileList.length; i++) {
      const item = fileList[i];
      if (item.status === "done") continue;

      updateStatus(i, "processing");
      try {
        if (mode === "kmz2shp") {
          await convertKmzToShp(item.file);
        } else {
          await convertShpToKmz(item.file);
        }
        updateStatus(i, "done");
      } catch (err) {
        console.error(err);
        updateStatus(i, "error");
      }
    }
  };

  const updateStatus = (index: number, status: FileItem["status"]) => {
    setFileList(prev => {
      const newList = [...prev];
      newList[index].status = status;
      return newList;
    });
  };

  const convertKmzToShp = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const kmlFile = Object.keys(zip.files).find(name => name.endsWith(".kml"));
    if (!kmlFile) throw new Error("KML not found");

    const kmlContent = await zip.file(kmlFile)?.async("string");
    const dom = new DOMParser().parseFromString(kmlContent || "", "text/xml");
    const geoJsonData = kml(dom);

    // Menjaga nama file asli (tanpa ekstensi)
    const originalName = file.name.split('.').slice(0, -1).join('.');
    
    shpwrite.download(geoJsonData, {
      folder: originalName,
      types: { point: 'points', polygon: 'polygons', line: 'lines' }
    });
  };

  const convertShpToKmz = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const shpFile = Object.keys(zip.files).find(name => name.endsWith(".shp"));
    const dbfFile = Object.keys(zip.files).find(name => name.endsWith(".dbf"));

    if (!shpFile || !dbfFile) throw new Error("Missing .shp or .dbf");

    const shpBuffer = await zip.file(shpFile)?.async("arraybuffer");
    const dbfBuffer = await zip.file(dbfFile)?.async("arraybuffer");
    const geojson = await shapefile.read(shpBuffer!, dbfBuffer!);
    const kmlContent = tokml(geojson);

    const kmzZip = new JSZip();
    kmzZip.file("doc.kml", kmlContent);
    const kmzBlob = await kmzZip.generateAsync({ type: "blob" });

    const originalName = file.name.split('.').slice(0, -1).join('.');
    const url = URL.createObjectURL(kmzBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${originalName}.kmz`;
    a.click();
  };

  return (
    <main className="min-h-screen bg-[#F4F4F4] p-10 font-mono text-black">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        
        {/* Judul & Tab */}
        <div className="text-center space-y-6">
          <h1 className="text-5xl font-black uppercase tracking-tighter">Geo-Converter</h1>
          <div className="flex justify-center gap-4">
            <button 
              onClick={() => setMode("kmz2shp")}
              className={`px-6 py-2 border-4 border-black font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:shadow-none active:translate-x-1 active:translate-y-1 ${mode === "kmz2shp" ? "bg-[#74C0FC]" : "bg-white"}`}
            >
              KMZ to SHP
            </button>
            <button 
              onClick={() => setMode("shp2kmz")}
              className={`px-6 py-2 border-4 border-black font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:shadow-none active:translate-x-1 active:translate-y-1 ${mode === "shp2kmz" ? "bg-[#FFD43B]" : "bg-white"}`}
            >
              SHP to KMZ
            </button>
          </div>
        </div>

        {/* Upload Box */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-4 border-black border-dashed p-12 text-center cursor-pointer transition-colors ${isDragging ? "bg-green-100" : "bg-white"}`}
        >
          <input 
            type="file" 
            multiple 
            hidden 
            ref={fileInputRef} 
            onChange={(e) => addFiles(Array.from(e.target.files || []))}
            accept={mode === "kmz2shp" ? ".kmz" : ".zip"}
          />
          <p className="text-xl font-bold uppercase">Seret File Kesini</p>
          <p className="text-sm mt-2 opacity-60">Atau klik untuk memilih file (Batch Support)</p>
        </div>

        {/* Preview List */}
        {fileList.length > 0 && (
          <div className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
            <h2 className="text-xl font-black mb-4 uppercase border-b-4 border-black pb-2">Daftar File ({fileList.length})</h2>
            <div className="space-y-3">
              {fileList.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-3 border-2 border-black bg-[#f0f0f0]">
                  <span className="truncate max-w-[70%] font-bold">{item.file.name}</span>
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-black uppercase ${item.status === 'done' ? 'text-green-600' : 'text-blue-600'}`}>
                      {item.status}
                    </span>
                    <button onClick={() => removeFile(index)} className="hover:text-red-600 font-black">X</button>
                  </div>
                </div>
              ))}
            </div>
            <button 
              onClick={processBatch}
              className="w-full mt-6 bg-[#63E6BE] py-4 border-4 border-black font-black text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
            >
              PROSES SEKARANG
            </button>
          </div>
        )}
      </div>
    </main>
  );
}